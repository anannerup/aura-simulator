/**
 * Addon bundles on the server: all files a loader needs (see `collectAddonBundle` in the core) as one
 * JSON document `{ ref, set, files: { path: source } }`, read through the disk cache.
 *
 * Compression: Next.js drops a route handler's own Content-Encoding header, and its built-in gzip
 * only runs under `next start` (on every request: ~100 ms of CPU for the 6 MB full bundle). So the
 * bundle is gzipped once per resolved ref and also served as a plain `application/gzip` body, which
 * the browser inflates with DecompressionStream. Measured on v1.15.0 (306 files, 6.06 MB JSON):
 * gzip -6 1.24 MB (95 ms), brotli -9 1.01 MB (320 ms) but DecompressionStream can't inflate brotli
 * everywhere, brotli -11 0.91 MB (8 s). A binary pack (path, length, bytes) compresses <1% smaller
 * and saves ~13 ms of JSON.parse, so JSON stays.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { collectAddonBundle, type AddonBundle, type AddonBundleSet } from "@/core";
import type { AddonSourceCache, Resolution } from "./source-cache";

const gzipAsync = promisify(gzip);

/** Bump when the bundle's file selection changes, so disk-memoised file lists are rebuilt. */
const FORMAT = 1;

export interface EncodedAddonBundle {
  resolution: Resolution;
  set: AddonBundleSet;
  /** Strong ETag over the JSON (the same for the plain and the gzip body; the URL tells them apart). */
  etag: string;
  json: Uint8Array;
  /** The JSON gzipped, made on first use and kept (in memory and on disk). */
  gzipped(): Promise<Uint8Array>;
}

/** Builds a bundle by reading every file through the server's disk cache (fetching misses from jsDelivr). */
export async function buildAddonBundle(cache: AddonSourceCache, input: string, set: AddonBundleSet): Promise<AddonBundle> {
  const resolution = await cache.resolve(input);
  const read = (p: string) => cache.readText(resolution.ref, p);
  // Which files belong to the set is memoised per resolved ref; their texts come from the disk cache.
  const paths = await cache.memo(resolution, `bundle-${set}-v${FORMAT}-paths`, async () =>
    Object.keys((await collectAddonBundle(read, resolution.ref, set)).files),
  );
  const texts = await Promise.all(paths.map(read));
  return { ref: resolution.ref, set, files: Object.fromEntries(paths.map((p, i) => [p, texts[i]])) };
}

const MEMORY_LIMIT = 6;
const globalForBundles = globalThis as typeof globalThis & { __addonBundles?: Map<string, Promise<EncodedAddonBundle>> };

/** The encoded bundle for a ref and set, kept in memory (the few most recently used). */
export async function getEncodedAddonBundle(
  cache: AddonSourceCache,
  input: string,
  set: AddonBundleSet,
): Promise<EncodedAddonBundle> {
  const resolution = await cache.resolve(input);
  const memory = (globalForBundles.__addonBundles ??= new Map());
  const key = `${cache.root}\n${resolution.key}\n${resolution.ref}\n${set}`;
  let hit = memory.get(key);
  if (hit) {
    memory.delete(key);
  } else {
    hit = encodeBundle(cache, resolution, set);
    hit.catch(() => memory.delete(key));
  }
  memory.set(key, hit);
  while (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value!);
  return hit;
}

async function encodeBundle(cache: AddonSourceCache, resolution: Resolution, set: AddonBundleSet): Promise<EncodedAddonBundle> {
  const bundle = await buildAddonBundle(cache, resolution.ref, set);
  const json = new TextEncoder().encode(JSON.stringify(bundle));
  const hash = createHash("sha256").update(json).digest("base64url").slice(0, 32);
  let gz: Promise<Uint8Array> | undefined;
  const gzipped = () => {
    if (!gz) {
      // Named by content hash, so a file on disk can't go stale.
      const file = path.join(cache.root, resolution.key, `bundle-${set}-${hash}.json.gz`);
      gz = cachedOnDisk(file, async () => new Uint8Array(await gzipAsync(json, { level: 6 })));
      gz.catch(() => (gz = undefined));
    }
    return gz;
  };
  return { resolution, set, etag: `"${hash}"`, json, gzipped };
}

async function cachedOnDisk(file: string, make: () => Promise<Uint8Array>): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(file));
  } catch {}
  const body = await make();
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, file);
  } catch {}
  return body;
}
