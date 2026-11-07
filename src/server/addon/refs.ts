/**
 * Addon refs: release tags, branches and commits of Musca Auras, and how jsDelivr's version
 * list maps back to the repo's real tag names.
 *
 * The repo's tags are inconsistently named: most are `v1.15.0`, some are `1.13.0`, and pre-releases
 * look like `1.15.0-beta2`. jsDelivr lists them all normalized (`1.15.0`, `1.13.0`, `1.15.0-beta2`),
 * so the real names come from GitHub's tag list.
 */
import type { AddonRelease } from "@/api/addon";

export type { AddonRelease };

export interface GitHubTag {
  name: string;
  sha: string;
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** "v1.15.0" → "1.15.0"; null when the name isn't a version. */
export function normalizeVersion(name: string): string | null {
  const m = SEMVER.exec(name.trim());
  if (!m) return null;
  return `${m[1]}.${m[2]}.${m[3]}${m[4] ? `-${m[4]}` : ""}`;
}

/** Semver-ish ordering, newest first; pre-releases sort below their release. */
export function compareVersionsDesc(a: string, b: string): number {
  const ma = SEMVER.exec(a);
  const mb = SEMVER.exec(b);
  if (!ma || !mb) return a < b ? 1 : a > b ? -1 : 0;
  for (let i = 1; i <= 3; i++) {
    const d = Number(mb[i]) - Number(ma[i]);
    if (d !== 0) return d;
  }
  const pa = ma[4];
  const pb = mb[4];
  if (pa === pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  return pb.localeCompare(pa, "en", { numeric: true });
}

/**
 * Joins jsDelivr's version list with GitHub's tags. Tags GitHub knows but jsDelivr hasn't listed yet are
 * kept too (jsDelivr fetches them on demand). Without GitHub (`tags` null), the jsDelivr version doubles as tag.
 */
export function mapReleases(jsDelivrVersions: string[], tags: GitHubTag[] | null): AddonRelease[] {
  const byVersion = new Map<string, AddonRelease>();
  for (const t of tags ?? []) {
    const version = normalizeVersion(t.name);
    if (!version) continue;
    const existing = byVersion.get(version);
    // Two tags for one version ("v1.2.0" and "1.2.0"): prefer the one spelled like the version itself.
    if (existing && existing.tag === version) continue;
    byVersion.set(version, { version, tag: t.name, tagConfirmed: true, prerelease: version.includes("-"), sha: t.sha });
  }
  for (const raw of jsDelivrVersions) {
    const version = normalizeVersion(raw);
    if (!version || byVersion.has(version)) continue;
    byVersion.set(version, { version, tag: version, tagConfirmed: false, prerelease: version.includes("-") });
  }
  return [...byVersion.values()].sort((a, b) => compareVersionsDesc(a.version, b.version));
}

/** The newest stable release (the picker's default), or the newest pre-release if there is no stable one. */
export function defaultRelease(releases: AddonRelease[]): AddonRelease | undefined {
  return releases.find((r) => !r.prerelease) ?? releases[0];
}

/** Finds the release a user typed: "v1.14.0", "1.14.0" or the real tag name all match. */
export function findRelease(releases: AddonRelease[], input: string): AddonRelease | undefined {
  const exact = releases.find((r) => r.tag === input);
  if (exact) return exact;
  const version = normalizeVersion(input);
  return version ? releases.find((r) => r.version === version) : undefined;
}

export const isFullSha = (s: string) => /^[0-9a-f]{40}$/i.test(s);
export const looksLikeShortSha = (s: string) => /^[0-9a-f]{7,39}$/i.test(s);

/** Allowed ref syntax (git's rules are looser; this keeps URLs and cache paths safe). */
export function assertValidRef(ref: string): void {
  if (!ref || ref.length > 200 || !/^[A-Za-z0-9._\-/]+$/.test(ref) || ref.includes("..") || ref.startsWith("/")) {
    throw new AddonRefError(`"${ref}" is not a valid release, branch or commit name`, 400);
  }
}

/** Allowed repo-relative file paths. */
export function assertValidPath(p: string): void {
  if (
    !p ||
    p.length > 500 ||
    p.startsWith("/") ||
    p.includes("\\") ||
    p.split("/").some((seg) => seg === "" || seg === "." || seg === "..")
  ) {
    throw new AddonRefError(`"${p}" is not a valid file path in the addon`, 400);
  }
}

/** An error with the HTTP status the API should answer with. */
export class AddonRefError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AddonRefError";
  }
}
