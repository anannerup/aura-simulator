/**
 * Official WeakAuras2 (the addon TBC Anniversary players run) from its GitHub release zips.
 *
 * WeakAuras2's source tree can't be loaded as it is (its libraries are packager externals, locales and version
 * strings are filled in at packaging), so the server loads exactly what players install: the release zip of a tag.
 * Release downloads send no CORS headers, so only the server can fetch them.
 *
 * Layout under `root`:
 *   github-releases.json       last good release list (fallback when GitHub is unreachable or rate limited)
 *   <version>/release.json     the release the files came from (written last: its presence means "unpacked")
 *   <version>/src/<path>       the zip's files, at the zip's own paths (`WeakAuras/Init.lua`, …), bytes as shipped
 * A release never changes, so its files are kept forever.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { collectAddonBundle, type AddonBundle, type AddonBundleSet, type AddonSourceFetcher } from "@/core";
import { HttpError } from "@/lib/fetch-json";
import { AddonRefError, assertValidPath, compareVersionsDesc, normalizeVersion } from "./refs";
import type { FetchFn } from "./upstream";
import { unzip } from "./unzip";
import { writeAtomic } from "./write-atomic";

export const WEAKAURAS2_REPO = "WeakAuras/WeakAuras2";
/** The first release with TBC Anniversary support (commit 9f40140 "TBC Anniversary support"). */
export const WEAKAURAS2_MIN_VERSION = "5.21.0";

export interface WeakAuras2Release {
  /** The tag, bare semver ("5.22.1"). */
  version: string;
  prerelease: boolean;
  publishedAt: string;
  zip: { url: string; size: number; /** "sha256:<hex>" when GitHub published one. */ digest?: string };
}

export interface WeakAuras2Versions {
  /** Releases with a zip, newest first, from WEAKAURAS2_MIN_VERSION on. */
  releases: WeakAuras2Release[];
  /** The newest release that is not a pre-release. */
  defaultVersion: string | null;
}

export interface WeakAuras2ReleaseCache {
  readonly root: string;
  versions(): Promise<WeakAuras2Versions>;
  /** Downloads and unpacks a release once; afterwards its files are read from disk. Returns the release. */
  ensure(version: string): Promise<WeakAuras2Release>;
  /** Reads one file of a release (repo-relative path inside the zip, e.g. "WeakAuras/WeakAuras_TBC.toc"). */
  readText(version: string, filePath: string): Promise<string>;
  /** A source fetcher over one release's files, for `loadAddon`. */
  fetcher(version: string): AddonSourceFetcher;
  /** A light or full bundle of a release: the files TBC Anniversary loads (its `_TBC.toc` file sets). */
  bundle(version: string, set: AddonBundleSet): Promise<AddonBundle>;
}

export interface WeakAuras2ReleaseCacheOptions {
  root: string;
  fetch?: FetchFn;
  /** How long the release list stays fresh in memory. Default 10 minutes. */
  ttlMs?: number;
  now?: () => number;
}

interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  assets: { name: string; size: number; digest?: string | null; browser_download_url: string }[];
}

const releasesUrl = (page: number) => `https://api.github.com/repos/${WEAKAURAS2_REPO}/releases?per_page=100&page=${page}`;

function githubInit(): RequestInit {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "aura-simulator" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return { headers };
}

const atLeastMin = (version: string) => compareVersionsDesc(version, WEAKAURAS2_MIN_VERSION) <= 0;

/** GitHub's releases → the ones the app offers: published, a bare version from 5.21.0 on, with a `WeakAuras-<tag>.zip`. */
export function selectWeakAuras2Releases(releases: GitHubRelease[]): WeakAuras2Release[] {
  const out: WeakAuras2Release[] = [];
  for (const r of releases) {
    const version = normalizeVersion(r.tag_name);
    if (r.draft || version !== r.tag_name || !atLeastMin(version)) continue;
    const asset = r.assets.find((a) => a.name === `WeakAuras-${r.tag_name}.zip`);
    if (!asset) continue; // e.g. 5.21.9: a release without assets
    out.push({
      version,
      prerelease: r.prerelease,
      publishedAt: r.published_at,
      zip: { url: asset.browser_download_url, size: asset.size, ...(asset.digest && { digest: asset.digest }) },
    });
  }
  return out.sort((a, b) => compareVersionsDesc(a.version, b.version));
}

async function fetchGitHubReleases(fetchFn: FetchFn): Promise<GitHubRelease[]> {
  const all: GitHubRelease[] = [];
  for (let page = 1; page <= 10; page++) {
    const url = releasesUrl(page);
    const res = await fetchFn(url, githubInit());
    if (!res.ok) throw new HttpError(res.status, `GET ${url} failed: HTTP ${res.status}`);
    const body = (await res.json()) as GitHubRelease[];
    all.push(...body);
    // Releases come newest first: once a page reaches below the first supported version, the rest is older.
    const oldest = body.map((r) => normalizeVersion(r.tag_name)).filter((v): v is string => v !== null).at(-1);
    if (body.length < 100 || (oldest && !atLeastMin(oldest))) break;
  }
  return all;
}

export function createWeakAuras2ReleaseCache(options: WeakAuras2ReleaseCacheOptions): WeakAuras2ReleaseCache {
  const { root } = options;
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const ttl = options.ttlMs ?? 10 * 60_000;
  const now = options.now ?? Date.now;
  let versionsMemo: { at: number; value: Promise<WeakAuras2Versions> } | null = null;
  const unpacking = new Map<string, Promise<WeakAuras2Release>>();

  async function readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      return null;
    }
  }

  async function loadVersions(): Promise<WeakAuras2Versions> {
    const file = path.join(root, "github-releases.json");
    let releases: WeakAuras2Release[];
    try {
      releases = selectWeakAuras2Releases(await fetchGitHubReleases(fetchFn));
      await writeAtomic(file, JSON.stringify(releases));
    } catch (e) {
      const saved = await readJson<WeakAuras2Release[]>(file);
      if (!saved) throw new AddonRefError(`Could not list WeakAuras releases on GitHub (${(e as Error).message})`, 502);
      releases = saved;
    }
    return { releases, defaultVersion: releases.find((r) => !r.prerelease)?.version ?? null };
  }

  function versions(): Promise<WeakAuras2Versions> {
    if (versionsMemo && now() - versionsMemo.at < ttl) return versionsMemo.value;
    const value = loadVersions();
    versionsMemo = { at: now(), value };
    value.catch(() => {
      if (versionsMemo?.value === value) versionsMemo = null;
    });
    return value;
  }

  const releaseDir = (version: string) => path.join(root, version);

  async function download(release: WeakAuras2Release): Promise<void> {
    const res = await fetchFn(release.zip.url, { headers: { "User-Agent": "aura-simulator" } });
    if (!res.ok) throw new AddonRefError(`Could not download WeakAuras ${release.version}: HTTP ${res.status}`, 502);
    const zip = new Uint8Array(await res.arrayBuffer());
    const digest = `sha256:${createHash("sha256").update(zip).digest("hex")}`;
    if (release.zip.digest && release.zip.digest !== digest) {
      throw new AddonRefError(`WeakAuras ${release.version}'s zip doesn't match GitHub's checksum (${digest})`, 502);
    }
    const entries = unzip(zip);
    for (const entry of entries) {
      assertValidPath(entry.path); // no absolute paths or "..": every file stays inside the release's folder
      await writeAtomic(path.join(releaseDir(release.version), "src", entry.path), entry.bytes);
    }
    await writeAtomic(path.join(releaseDir(release.version), "release.json"), JSON.stringify({ ...release, zip: { ...release.zip, digest } }));
  }

  async function ensure(input: string): Promise<WeakAuras2Release> {
    const version = normalizeVersion(input);
    if (!version || version !== input.trim()) throw new AddonRefError(`"${input}" is not a WeakAuras release`, 400);
    const unpacked = await readJson<WeakAuras2Release>(path.join(releaseDir(version), "release.json"));
    if (unpacked) return unpacked;
    let running = unpacking.get(version);
    if (!running) {
      running = (async () => {
        const { releases } = await versions();
        const release = releases.find((r) => r.version === version);
        if (!release) {
          throw new AddonRefError(
            `WeakAuras has no release ${version} with a zip (TBC Anniversary needs ${WEAKAURAS2_MIN_VERSION} or later)`,
            404,
          );
        }
        await download(release);
        return release;
      })().finally(() => unpacking.delete(version));
      unpacking.set(version, running);
    }
    return running;
  }

  async function readText(version: string, filePath: string): Promise<string> {
    assertValidPath(filePath);
    const release = await ensure(version);
    try {
      return await readFile(path.join(releaseDir(release.version), "src", filePath), "utf8");
    } catch {
      throw new AddonRefError(`WeakAuras ${release.version} has no file ${filePath}`, 404);
    }
  }

  const fetcher = (version: string): AddonSourceFetcher => (filePath) => readText(version, filePath);

  return {
    root,
    versions,
    ensure,
    readText,
    fetcher,
    async bundle(version, set) {
      const release = await ensure(version);
      return collectAddonBundle(fetcher(release.version), release.version, set, "tbc");
    },
  };
}
