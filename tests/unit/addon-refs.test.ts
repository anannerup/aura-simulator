import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertValidPath,
  assertValidRef,
  compareVersionsDesc,
  defaultRelease,
  findRelease,
  mapReleases,
  normalizeVersion,
} from "@/server/addon";

const fixture = (name: string) => JSON.parse(readFileSync(path.join(__dirname, "../fixtures/addon", name), "utf8"));
const jsDelivrVersions: string[] = fixture("jsdelivr-versions.json").versions.map((v: { version: string }) => v.version);
const tags = (fixture("github-tags.json") as { name: string; commit: { sha: string } }[]).map((t) => ({
  name: t.name,
  sha: t.commit.sha,
}));

describe("normalizeVersion", () => {
  it("strips the v prefix and keeps pre-release suffixes", () => {
    expect(normalizeVersion("v1.15.0")).toBe("1.15.0");
    expect(normalizeVersion("1.13.0")).toBe("1.13.0");
    expect(normalizeVersion("1.15.0-beta2")).toBe("1.15.0-beta2");
    expect(normalizeVersion("v1.15.0-beta1")).toBe("1.15.0-beta1");
  });

  it("returns null for branch names and SHAs", () => {
    expect(normalizeVersion("main")).toBeNull();
    expect(normalizeVersion("forever-spell-ids")).toBeNull();
    expect(normalizeVersion("448b7b3886fe7f76b45ce1ae067085ac526a2d95")).toBeNull();
  });
});

describe("compareVersionsDesc", () => {
  it("orders newest first, pre-releases below their release, numerically", () => {
    const sorted = ["1.9.1", "1.15.0-beta1", "1.10.0", "1.15.0", "1.15.0-beta2", "1.9.0"].sort(compareVersionsDesc);
    expect(sorted).toEqual(["1.15.0", "1.15.0-beta2", "1.15.0-beta1", "1.10.0", "1.9.1", "1.9.0"]);
  });
});

describe("mapReleases (recorded jsDelivr versions + GitHub tags)", () => {
  const releases = mapReleases(jsDelivrVersions, tags);

  it("maps jsDelivr's normalized versions back to the real, inconsistently prefixed tag names", () => {
    const tagOf = (v: string) => releases.find((r) => r.version === v)?.tag;
    expect(tagOf("1.15.0")).toBe("v1.15.0");
    expect(tagOf("1.15.0-beta2")).toBe("1.15.0-beta2");
    expect(tagOf("1.15.0-beta1")).toBe("v1.15.0-beta1");
    expect(tagOf("1.14.0")).toBe("v1.14.0");
    expect(tagOf("1.13.0")).toBe("1.13.0");
    expect(tagOf("1.9.1")).toBe("1.9.1");
    expect(tagOf("1.3.1")).toBe("v1.3.1");
    expect(releases.every((r) => r.tagConfirmed)).toBe(true);
    expect(releases).toHaveLength(jsDelivrVersions.length);
  });

  it("lists newest first and defaults to the newest stable release", () => {
    expect(releases[0].version).toBe("1.15.0");
    expect(releases.map((r) => r.version)).toEqual(jsDelivrVersions);
    expect(defaultRelease(releases)?.tag).toBe("v1.15.0");
    expect(defaultRelease(releases.filter((r) => r.version !== "1.15.0"))?.tag).toBe("v1.14.0");
  });

  it("marks pre-releases and keeps the tag's commit", () => {
    const beta = releases.find((r) => r.version === "1.15.0-beta2")!;
    expect(beta.prerelease).toBe(true);
    expect(beta.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("keeps tags jsDelivr hasn't listed yet", () => {
    const withNew = mapReleases(jsDelivrVersions, [{ name: "v1.16.0", sha: "a".repeat(40) }, ...tags]);
    expect(withNew[0]).toMatchObject({ version: "1.16.0", tag: "v1.16.0" });
    expect(defaultRelease(withNew)?.tag).toBe("v1.16.0");
  });

  it("without GitHub, uses jsDelivr's versions as unconfirmed tags", () => {
    const guessed = mapReleases(jsDelivrVersions, null);
    expect(guessed[0]).toMatchObject({ version: "1.15.0", tag: "1.15.0", tagConfirmed: false });
  });

  it("finds a release by either spelling", () => {
    expect(findRelease(releases, "1.14.0")?.tag).toBe("v1.14.0");
    expect(findRelease(releases, "v1.13.0")?.tag).toBe("1.13.0");
    expect(findRelease(releases, "v1.15.0")?.tag).toBe("v1.15.0");
    expect(findRelease(releases, "main")).toBeUndefined();
  });
});

describe("validation", () => {
  it("accepts tags, branches and SHAs; rejects path tricks", () => {
    for (const ok of ["v1.15.0", "1.15.0-beta2", "main", "feature/x", "448b7b3"]) expect(() => assertValidRef(ok)).not.toThrow();
    for (const bad of ["", "../x", "/main", "a b", "x?y", "a%2Fb"]) expect(() => assertValidRef(bad)).toThrow();
  });

  it("accepts repo paths; rejects traversal and absolute paths", () => {
    expect(() => assertValidPath("WeakAuras/Init.lua")).not.toThrow();
    for (const bad of ["", "/etc/passwd", "../x", "a/../b", "a//b", "a\\b"]) expect(() => assertValidPath(bad)).toThrow();
  });
});
