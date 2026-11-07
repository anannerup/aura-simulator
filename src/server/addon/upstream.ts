/**
 * Remote sources for the addon: jsDelivr (version list, file listings, file contents; no rate limit)
 * and GitHub's REST API (real tag names, branch → commit, full file trees; 60 requests/hour
 * unauthenticated, so every answer is cached by the caller). GITHUB_TOKEN raises the limit if set.
 */
import { ADDON_REPO, jsDelivrUrl } from "@/core";
import type { FileListing } from "@/api/addon";
import { AddonRefError, type GitHubTag } from "./refs";

export type { FileListing };

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const JSDELIVR_DATA = `https://data.jsdelivr.com/v1/packages/gh/${ADDON_REPO}`;
const GITHUB_API = `https://api.github.com/repos/${ADDON_REPO}`;

export const urls = {
  versions: JSDELIVR_DATA,
  flatListing: (ref: string) => `${JSDELIVR_DATA}@${encodeURIComponent(ref)}?structure=flat`,
  tags: (page: number) => `${GITHUB_API}/tags?per_page=100&page=${page}`,
  branches: `${GITHUB_API}/branches?per_page=100`,
  branch: (name: string) => `${GITHUB_API}/branches/${encodeURIComponent(name)}`,
  commit: (sha: string) => `${GITHUB_API}/commits/${encodeURIComponent(sha)}`,
  tree: (sha: string) => `${GITHUB_API}/git/trees/${encodeURIComponent(sha)}?recursive=1`,
};

function githubInit(): RequestInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "aura-simulator",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return { headers };
}

async function getJson<T>(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<T> {
  const res = await fetchFn(url, init);
  if (!res.ok) throw new HttpError(`GET ${url} failed: HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** jsDelivr's normalized version list. */
export async function fetchJsDelivrVersions(fetchFn: FetchFn): Promise<string[]> {
  const body = await getJson<{ versions?: { version: string }[] }>(fetchFn, urls.versions);
  return (body.versions ?? []).map((v) => v.version);
}

/** Every tag of the repo with its commit. */
export async function fetchGitHubTags(fetchFn: FetchFn): Promise<GitHubTag[]> {
  const tags: GitHubTag[] = [];
  for (let page = 1; page <= 10; page++) {
    const body = await getJson<{ name: string; commit: { sha: string } }[]>(fetchFn, urls.tags(page), githubInit());
    tags.push(...body.map((t) => ({ name: t.name, sha: t.commit.sha })));
    if (body.length < 100) break;
  }
  return tags;
}

export async function fetchGitHubBranches(fetchFn: FetchFn): Promise<{ name: string; sha: string }[]> {
  const body = await getJson<{ name: string; commit: { sha: string } }[]>(fetchFn, urls.branches, githubInit());
  return body.map((b) => ({ name: b.name, sha: b.commit.sha }));
}

/** Branch name → commit SHA; null when there is no such branch. */
export async function fetchBranchSha(fetchFn: FetchFn, name: string): Promise<string | null> {
  try {
    const body = await getJson<{ commit: { sha: string } }>(fetchFn, urls.branch(name), githubInit());
    return body.commit.sha;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

/** Short (or full) commit SHA → full SHA; null when there is no such commit. */
export async function fetchCommitSha(fetchFn: FetchFn, sha: string): Promise<string | null> {
  try {
    const body = await getJson<{ sha: string }>(fetchFn, urls.commit(sha), githubInit());
    return body.sha;
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 422)) return null;
    throw e;
  }
}

/** All files at a ref: GitHub's recursive tree, or jsDelivr's flat listing when GitHub is unavailable. */
export async function fetchFileListing(fetchFn: FetchFn, ref: string): Promise<FileListing> {
  try {
    const body = await getJson<{ tree: { path: string; type: string; sha: string }[]; truncated: boolean }>(
      fetchFn,
      urls.tree(ref),
      githubInit(),
    );
    const files = body.tree.filter((e) => e.type === "blob").map((e) => ({ path: e.path, hash: e.sha }));
    return { files: sortByPath(files), source: "github-tree", complete: !body.truncated };
  } catch {
    const body = await getJson<{ files: { name: string; hash: string }[] }>(fetchFn, urls.flatListing(ref));
    const files = body.files.map((f) => ({ path: f.name.replace(/^\//, ""), hash: f.hash }));
    return { files: sortByPath(files), source: "jsdelivr-flat", complete: files.length < 1000 };
  }
}

const sortByPath = <T extends { path: string }>(files: T[]) =>
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

/** One file's bytes from jsDelivr. */
export async function fetchAddonFile(fetchFn: FetchFn, ref: string, path: string): Promise<Uint8Array> {
  const url = jsDelivrUrl(ref, path);
  const res = await fetchFn(url);
  if (res.status === 404) throw new AddonRefError(`Musca Auras ${ref} has no file ${path}`, 404);
  if (!res.ok) throw new AddonRefError(`Could not load ${path} of Musca Auras ${ref}: HTTP ${res.status}`, 502);
  return new Uint8Array(await res.arrayBuffer());
}
