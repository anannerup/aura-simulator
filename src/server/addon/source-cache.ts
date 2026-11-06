/**
 * The addon source cache: resolves refs to immutable ones and serves the addon's files from disk,
 * fetching from jsDelivr on a miss.
 *
 * Layout under `root` (default `<repo>/data/addon`):
 *   <key>/src/<path>       file contents, where <key> is a release's normalised version or a full commit SHA
 *   <key>/listing.json     the ref's file list (see FileListing)
 *   github-tags.json       last good GitHub tag list (fallback when GitHub is rate limited)
 * Releases and commits never change, so their files are cached forever. Branches resolve to a commit
 * SHA first (cached in memory for a few minutes), so a branch's files are cached per commit.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  fetchAddonFile,
  fetchBranchSha,
  fetchCommitSha,
  fetchFileListing,
  fetchGitHubBranches,
  fetchGitHubTags,
  fetchJsDelivrVersions,
  type FetchFn,
  type FileListing,
} from "./remote";
import {
  AddonRefError,
  assertValidPath,
  assertValidRef,
  defaultRelease,
  findRelease,
  isFullSha,
  looksLikeShortSha,
  mapReleases,
  normaliseVersion,
  type AddonRelease,
  type GitHubTag,
} from "./refs";

export interface VersionList {
  releases: AddonRelease[];
  /** Tag of the newest stable release: the picker's default. */
  defaultRef: string | null;
  /** Branch names, when GitHub answered. */
  branches: string[];
  /** False when GitHub's tag list was unavailable and tag names are guesses. */
  tagsConfirmed: boolean;
}

/** What a ref the user typed turned out to be. */
export interface Resolution {
  /** What was asked for. */
  input: string;
  kind: "release" | "branch" | "commit";
  /** Immutable ref to fetch with: the real tag name, or a commit SHA. */
  ref: string;
  /** Disk cache directory name (normalised version or commit SHA). */
  key: string;
  /** Normalised version, for releases. */
  version?: string;
  /** Commit SHA, when known. */
  sha?: string;
}

export interface AddonSourceCache {
  versions(): Promise<VersionList>;
  resolve(input: string): Promise<Resolution>;
  /** One file's bytes. `input` may be any ref; it is resolved first. */
  readFile(input: string, filePath: string): Promise<{ resolution: Resolution; bytes: Uint8Array }>;
  readText(input: string, filePath: string): Promise<string>;
  listFiles(input: string): Promise<{ resolution: Resolution; listing: FileListing }>;
  /** Cached JSON per resolved ref (used by the diff for extracted option tables). */
  memo<T>(resolution: Resolution, name: string, compute: () => Promise<T>): Promise<T>;
  readonly root: string;
}

export interface AddonSourceCacheOptions {
  root: string;
  fetch?: FetchFn;
  /** How long version lists and branch heads stay fresh in memory. Default 10 minutes. */
  ttlMs?: number;
  now?: () => number;
}

export function createAddonSourceCache(options: AddonSourceCacheOptions): AddonSourceCache {
  const root = options.root;
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const ttl = options.ttlMs ?? 10 * 60_000;
  const now = options.now ?? Date.now;

  let versionsMemo: { at: number; value: Promise<VersionList> } | null = null;
  const branchMemo = new Map<string, { at: number; sha: Promise<string | null> }>();
  const inflight = new Map<string, Promise<unknown>>();

  function once<T>(key: string, work: () => Promise<T>): Promise<T> {
    const running = inflight.get(key);
    if (running) return running as Promise<T>;
    const p = work().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  async function writeAtomic(file: string, data: Uint8Array | string) {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, file);
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
      const tags = await fetchGitHubTags(fetchFn);
      await writeAtomic(file, JSON.stringify(tags));
      return tags;
    } catch {
      return readJson<GitHubTag[]>(file);
    }
  }

  async function loadVersions(): Promise<VersionList> {
    const [jsd, tags, branches] = await Promise.all([
      fetchJsDelivrVersions(fetchFn).catch(() => null),
      githubTags(),
      fetchGitHubBranches(fetchFn).catch(() => null),
    ]);
    if (!jsd && !tags) throw new AddonRefError("Could not list Musca Auras versions: jsDelivr and GitHub both failed", 502);
    for (const b of branches ?? []) {
      branchMemo.set(b.name, { at: now(), sha: Promise.resolve(b.sha) });
    }
    const releases = mapReleases(jsd ?? [], tags);
    return {
      releases,
      defaultRef: defaultRelease(releases)?.tag ?? null,
      branches: (branches ?? []).map((b) => b.name),
      tagsConfirmed: tags !== null,
    };
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

  function branchSha(name: string): Promise<string | null> {
    const hit = branchMemo.get(name);
    if (hit && now() - hit.at < ttl) return hit.sha;
    const sha = fetchBranchSha(fetchFn, name);
    branchMemo.set(name, { at: now(), sha });
    sha.catch(() => branchMemo.delete(name));
    return sha;
  }

  async function resolve(rawInput: string): Promise<Resolution> {
    const input = rawInput.trim();
    assertValidRef(input);
    if (isFullSha(input)) {
      const sha = input.toLowerCase();
      return { input, kind: "commit", ref: sha, key: sha, sha };
    }
    const list = await versions().catch(() => null);
    const release = list ? findRelease(list.releases, input) : undefined;
    if (release) {
      return { input, kind: "release", ref: release.tag, key: release.version, version: release.version, sha: release.sha };
    }
    // Version lists unavailable (jsDelivr and GitHub down): a version-shaped ref is still a release.
    const version = normaliseVersion(input);
    if (!list && version) return { input, kind: "release", ref: input, key: version, version };
    let sha: string | null;
    try {
      sha = await branchSha(input);
    } catch (e) {
      throw new AddonRefError(
        `Could not look up branch "${input}" on GitHub (${e instanceof Error ? e.message : e}); try a release or a full commit SHA`,
        502,
      );
    }
    if (sha) return { input, kind: "branch", ref: sha, key: sha, sha };
    if (looksLikeShortSha(input)) {
      const full = await fetchCommitSha(fetchFn, input).catch(() => null);
      if (full) return { input, kind: "commit", ref: full, key: full, sha: full };
    }
    throw new AddonRefError(`Musca Auras has no release, branch or commit called "${input}"`, 404);
  }

  async function readFileAt(input: string, filePath: string) {
    assertValidPath(filePath);
    const resolution = await resolve(input);
    const local = path.join(root, resolution.key, "src", filePath);
    try {
      return { resolution, bytes: new Uint8Array(await readFile(local)) };
    } catch {
      const bytes = await once(`file:${local}`, async () => {
        const b = await fetchAddonFile(fetchFn, resolution.ref, filePath);
        await writeAtomic(local, b);
        return b;
      });
      return { resolution, bytes };
    }
  }

  async function memo<T>(resolution: Resolution, name: string, compute: () => Promise<T>): Promise<T> {
    const file = path.join(root, resolution.key, `${name}.json`);
    const hit = await readJson<T>(file);
    if (hit !== null) return hit;
    return once(`memo:${file}`, async () => {
      const value = await compute();
      await writeAtomic(file, JSON.stringify(value));
      return value;
    });
  }

  return {
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
      const listing = await memo(resolution, "listing", () => fetchFileListing(fetchFn, resolution.ref));
      return { resolution, listing };
    },
    memo,
  };
}
