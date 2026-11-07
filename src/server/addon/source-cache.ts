/**
 * The addon source cache for an addon whose released tags are loadable as they are in its GitHub repo: resolves a
 * release to its tag and serves its files from disk, fetching from jsDelivr on a miss.
 *
 * Layout under `root` (one per game, see `addonCacheDir`):
 *   <version>/src/<path>   file contents, by normalized version
 *   <version>/listing.json the release's file list (see FileListing)
 *   github-tags.json       last good GitHub tag list (fallback when GitHub is rate limited)
 * Releases never change, so their files are cached forever.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createUpstream, type AddonRepo, type FetchFn } from "./upstream";
import type { FileListing } from "@/api/addon";
import { AddonRefError, assertValidPath, assertValidRef, defaultRelease, findRelease, mapReleases, normalizeVersion, type GitHubTag } from "./refs";
import { writeAtomic } from "./write-atomic";
import type { Resolution, VersionList } from "@/api/addon";

export type { Resolution, VersionList };

export interface AddonSourceCache {
  /** The addon's name, for messages ("Musca Auras"). */
  readonly name: string;
  versions(): Promise<VersionList>;
  resolve(input: string): Promise<Resolution>;
  /** One file's bytes. `input` may be any spelling of a release; it is resolved first. */
  readFile(input: string, filePath: string): Promise<{ resolution: Resolution; bytes: Uint8Array }>;
  readText(input: string, filePath: string): Promise<string>;
  listFiles(input: string): Promise<{ resolution: Resolution; listing: FileListing }>;
  /** Cached JSON per release (used by the diff for extracted option tables). */
  memo<T>(resolution: Resolution, name: string, compute: () => Promise<T>): Promise<T>;
  /** The file a memo is kept in (e.g. for tests that seed or drop one). */
  memoFile(resolution: Resolution, name: string): string;
  readonly root: string;
}

export interface AddonSourceCacheOptions extends AddonRepo {
  root: string;
  fetch?: FetchFn;
  /** How long the version list stays fresh in memory. Default 10 minutes. */
  ttlMs?: number;
  now?: () => number;
}

export function createAddonSourceCache(options: AddonSourceCacheOptions): AddonSourceCache {
  const { root, name } = options;
  const upstream = createUpstream(options, options.fetch ?? ((input, init) => fetch(input, init)));
  const ttl = options.ttlMs ?? 10 * 60_000;
  const now = options.now ?? Date.now;

  let versionsMemo: { at: number; value: Promise<VersionList> } | null = null;
  const inflight = new Map<string, Promise<unknown>>();

  function once<T>(key: string, work: () => Promise<T>): Promise<T> {
    const running = inflight.get(key);
    if (running) return running as Promise<T>;
    const p = work().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  async function readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      return null;
    }
  }

  async function githubTags(): Promise<GitHubTag[] | null> {
    const file = path.join(root, "github-tags.json");
    try {
      const tags = await upstream.gitHubTags();
      await writeAtomic(file, JSON.stringify(tags));
      return tags;
    } catch {
      return readJson<GitHubTag[]>(file);
    }
  }

  async function loadVersions(): Promise<VersionList> {
    const [jsd, tags] = await Promise.all([upstream.jsDelivrVersions().catch(() => null), githubTags()]);
    if (!jsd && !tags) throw new AddonRefError(`Could not list ${name} versions: jsDelivr and GitHub both failed`, 502);
    const releases = mapReleases(jsd ?? [], tags);
    return { releases, defaultRef: defaultRelease(releases)?.tag ?? null, tagsConfirmed: tags !== null };
  }

  function versions(): Promise<VersionList> {
    if (versionsMemo && now() - versionsMemo.at < ttl) return versionsMemo.value;
    const value = loadVersions();
    versionsMemo = { at: now(), value };
    value.catch(() => {
      if (versionsMemo?.value === value) versionsMemo = null;
    });
    return value;
  }

  async function resolve(rawInput: string): Promise<Resolution> {
    const input = rawInput.trim();
    assertValidRef(input);
    const list = await versions().catch(() => null);
    const release = list ? findRelease(list.releases, input) : undefined;
    if (release) return { input, ref: release.tag, key: release.version, version: release.version, sha: release.sha };
    // Version lists unavailable (jsDelivr and GitHub down): a version-shaped ref is still taken for a release.
    const version = normalizeVersion(input);
    if (!list && version) return { input, ref: input, key: version, version };
    throw new AddonRefError(`${name} has no release called "${input}"`, 404);
  }

  async function readFileAt(input: string, filePath: string) {
    assertValidPath(filePath);
    const resolution = await resolve(input);
    const local = path.join(root, resolution.key, "src", filePath);
    try {
      return { resolution, bytes: new Uint8Array(await readFile(local)) };
    } catch {
      const bytes = await once(`file:${local}`, async () => {
        const b = await upstream.file(resolution.ref, filePath);
        await writeAtomic(local, b);
        return b;
      });
      return { resolution, bytes };
    }
  }

  const memoFile = (resolution: Resolution, memoName: string) => path.join(root, resolution.key, `${memoName}.json`);

  async function memo<T>(resolution: Resolution, memoName: string, compute: () => Promise<T>): Promise<T> {
    const file = memoFile(resolution, memoName);
    const hit = await readJson<T>(file);
    if (hit !== null) return hit;
    return once(`memo:${file}`, async () => {
      const value = await compute();
      await writeAtomic(file, JSON.stringify(value));
      return value;
    });
  }

  return {
    name,
    root,
    versions,
    resolve,
    readFile: readFileAt,
    async readText(input, filePath) {
      const { bytes } = await readFileAt(input, filePath);
      return new TextDecoder().decode(bytes);
    },
    async listFiles(input) {
      const resolution = await resolve(input);
      const listing = await memo(resolution, "listing", () => upstream.fileListing(resolution.ref));
      return { resolution, listing };
    },
    memo,
    memoFile,
  };
}
