/**
 * Browser side of the addon version picker: talks to /api/addon/* and builds the source fetcher the
 * aura core loads through (the server's cache first, jsDelivr directly if the server can't answer).
 */
import { jsDelivrFetcher, type AddonSourceFetcher } from "@/core";

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

/** Fetches files through the server's addon cache, falling back to jsDelivr per file. */
export function serverAddonFetcher(ref: string): AddonSourceFetcher {
  const fallback = jsDelivrFetcher(ref);
  return async (path) => {
    try {
      const res = await fetch(`/api/addon/${encodeURIComponent(ref)}/file?path=${encodeURIComponent(path)}`);
      if (res.ok) return await res.text();
    } catch {}
    return fallback(path);
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
