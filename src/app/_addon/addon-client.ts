/**
 * Browser side of the addon version picker: talks to /api/addon/* and builds the source fetcher the
 * aura core loads through (the server's cache first, jsDelivr directly if the server can't answer).
 */
import { bundleFetcher, jsDelivrFetcher, type AddonBundle, type AddonBundleSet, type AddonSourceFetcher } from "@/core";

export interface AddonReleaseInfo {
  version: string;
  tag: string;
  prerelease: boolean;
}

export interface VersionListInfo {
  releases: AddonReleaseInfo[];
  defaultRef: string | null;
  branches: string[];
  tagsConfirmed: boolean;
}

export interface ResolutionInfo {
  input: string;
  kind: "release" | "branch" | "commit";
  ref: string;
  version?: string;
  sha?: string;
}

export interface DiffInfo {
  summary: string[];
  changelog: string | null;
  files: { added: string[]; removed: string[]; changed: string[]; complete: boolean };
}

async function errorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {}
  return `HTTP ${res.status}`;
}

export async function fetchVersions(): Promise<VersionListInfo> {
  const res = await fetch("/api/addon/versions");
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

/**
 * Resolves a ref on the server. A ref the server says doesn't exist (4xx) throws; when the server itself
 * can't answer, returns null so the caller can fall back to jsDelivr with the ref as typed.
 */
export async function resolveRef(ref: string): Promise<ResolutionInfo | null> {
  let res: Response;
  try {
    res = await fetch(`/api/addon/resolve?ref=${encodeURIComponent(ref)}`);
  } catch {
    return null;
  }
  if (res.ok) return res.json();
  if (res.status >= 400 && res.status < 500) throw new Error(await errorText(res));
  return null;
}

/** Fetches one file through the server's addon cache, falling back to jsDelivr. */
function perFileFetcher(ref: string): AddonSourceFetcher {
  const fallback = jsDelivrFetcher(ref);
  return async (path) => {
    try {
      const res = await fetch(`/api/addon/${encodeURIComponent(ref)}/file?path=${encodeURIComponent(path)}`);
      if (res.ok) return await res.text();
    } catch {}
    return fallback(path);
  };
}

const BUNDLE_CACHE = "aura-simulator:addon-bundles";

export function addonBundleUrl(ref: string, set: AddonBundleSet): string {
  return `/api/addon/${encodeURIComponent(ref)}/bundle?set=${set}&format=gzip`;
}

/** Inflates and checks a `format=gzip` bundle response. */
async function readBundle(res: Response, set: AddonBundleSet): Promise<AddonBundle> {
  if (!res.body) throw new Error("The addon bundle came without a body");
  const bundle = (await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).json()) as AddonBundle;
  if (bundle?.set !== set || typeof bundle.files !== "object" || bundle.files === null) {
    throw new Error("The addon bundle is malformed");
  }
  return bundle;
}

async function openBundleCache(): Promise<Cache | null> {
  try {
    return await caches.open(BUNDLE_CACHE);
  } catch {
    return null; // No Cache Storage (insecure origin, private mode, old browser).
  }
}

/**
 * One request for every file of a bundle set. Immutable bundles (release tags, commit SHAs) are kept
 * in Cache Storage under their URL, which holds the resolved ref, so a repeat visit needs no network.
 */
async function loadBundle(ref: string, set: AddonBundleSet): Promise<AddonBundle> {
  const url = addonBundleUrl(ref, set);
  const cache = await openBundleCache();
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) return await readBundle(hit, set);
    } catch {
      await cache.delete(url).catch(() => false);
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (cache && /\bimmutable\b/.test(res.headers.get("Cache-Control") ?? "")) {
    cache.put(url, res.clone()).catch(() => {});
  }
  return readBundle(res, set);
}

/**
 * Fetches files through the server's addon cache: the whole bundle set in one request (from Cache
 * Storage when it's there), then any file the bundle doesn't hold, or every file if the bundle
 * fails, one by one from the server and then from jsDelivr.
 */
export function serverAddonFetcher(ref: string, set: AddonBundleSet = "full"): AddonSourceFetcher {
  const perFile = perFileFetcher(ref);
  let fetcher: Promise<AddonSourceFetcher> | undefined;
  return async (path) => {
    fetcher ??= loadBundle(ref, set).then(
      (bundle) => bundleFetcher(bundle, perFile),
      () => perFile,
    );
    return (await fetcher)(path);
  };
}

export async function fetchDiff(from: string, to: string): Promise<DiffInfo> {
  const res = await fetch(`/api/addon/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

const STORAGE_KEY = "aura-simulator:addon-ref";

export function readStoredRef(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeRef(ref: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, ref);
  } catch {}
}
