import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAddonSourceCache } from "@/server/addon";
import { createFixtureFetch } from "../fixtures/addon/fixture-fetch";

const MAIN_SHA = "448b7b3886fe7f76b45ce1ae067085ac526a2d95";
const FOREVER_SHA = "e7498db75a53c2f60cbe4fa6b3943ec318881eaf";

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "addon-cache-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function open(opts: Parameters<typeof createFixtureFetch>[0] = {}, extra: { now?: () => number } = {}) {
  const f = createFixtureFetch(opts);
  return { cache: createAddonSourceCache({ root, fetch: f.fetch, ...extra }), calls: f.calls };
}

describe("versions", () => {
  it("lists releases with real tag names, the newest stable as default, and branches", async () => {
    const { cache } = open();
    const list = await cache.versions();
    expect(list.defaultRef).toBe("v1.15.0");
    expect(list.tagsConfirmed).toBe(true);
    expect(list.releases.slice(0, 5).map((r) => r.tag)).toEqual([
      "v1.15.0",
      "1.15.0-beta2",
      "v1.15.0-beta1",
      "v1.14.0",
      "1.13.0",
    ]);
    expect(list.branches).toEqual(["forever-spell-ids", "main"]);
  });

  it("is cached in memory for the TTL", async () => {
    let t = 0;
    const { cache, calls } = open({}, { now: () => t });
    await cache.versions();
    const n = calls.length;
    await cache.versions();
    expect(calls.length).toBe(n);
    t += 11 * 60_000;
    await cache.versions();
    expect(calls.length).toBeGreaterThan(n);
  });

  it("falls back to the last good GitHub tag list on disk when GitHub is rate limited", async () => {
    await open().cache.versions();
    const list = await open({ githubDown: true }).cache.versions();
    expect(list.tagsConfirmed).toBe(true);
    expect(list.releases.find((r) => r.version === "1.14.0")?.tag).toBe("v1.14.0");
    expect(list.branches).toEqual([]);
  });

  it("without GitHub and without a saved list, uses jsDelivr's versions unconfirmed", async () => {
    const list = await open({ githubDown: true }).cache.versions();
    expect(list.tagsConfirmed).toBe(false);
    expect(list.defaultRef).toBe("1.15.0");
  });
});

describe("resolve", () => {
  it("resolves releases by either spelling to the real tag, keyed by normalised version", async () => {
    const { cache } = open();
    expect(await cache.resolve("1.14.0")).toMatchObject({ kind: "release", ref: "v1.14.0", key: "1.14.0" });
    expect(await cache.resolve("v1.13.0")).toMatchObject({ kind: "release", ref: "1.13.0", key: "1.13.0" });
    expect(await cache.resolve(" v1.15.0 ")).toMatchObject({ kind: "release", ref: "v1.15.0", sha: MAIN_SHA });
  });

  it("resolves branches to their commit SHA", async () => {
    const { cache } = open();
    expect(await cache.resolve("main")).toMatchObject({ kind: "branch", ref: MAIN_SHA, key: MAIN_SHA });
    expect(await cache.resolve("forever-spell-ids")).toMatchObject({ kind: "branch", ref: FOREVER_SHA });
  });

  it("takes full SHAs as they are and expands short SHAs", async () => {
    const { cache, calls } = open();
    expect(await cache.resolve(MAIN_SHA.toUpperCase())).toMatchObject({ kind: "commit", ref: MAIN_SHA });
    expect(calls).toEqual([]);
    expect(await cache.resolve("e7498db")).toMatchObject({ kind: "commit", ref: FOREVER_SHA });
  });

  it("fails clearly for refs that don't exist or aren't valid", async () => {
    const { cache } = open();
    await expect(cache.resolve("no-such-branch")).rejects.toMatchObject({ status: 404, message: /no release, branch or commit called "no-such-branch"/ });
    await expect(cache.resolve("../etc")).rejects.toMatchObject({ status: 400 });
  });

  it("says so when GitHub can't be asked about a branch", async () => {
    const { cache } = open({ githubDown: true });
    await expect(cache.resolve("main")).rejects.toMatchObject({ status: 502, message: /Could not look up branch "main"/ });
    // Releases still resolve from jsDelivr's list.
    expect(await cache.resolve("v1.14.0")).toMatchObject({ kind: "release", key: "1.14.0" });
  });
});

describe("files", () => {
  it("fetches from jsDelivr once, then serves from disk, also across restarts", async () => {
    const first = open();
    expect(await first.cache.readText("1.14.0", "WeakAuras/Init.lua")).toBe("-- WeakAuras/Init.lua at v1.14.0\n");
    expect(first.calls.filter((u) => u.includes("cdn.jsdelivr.net"))).toEqual([
      "https://cdn.jsdelivr.net/gh/dldvlpr-addons-wow/Musca-Auras@v1.14.0/WeakAuras/Init.lua",
    ]);
    expect(existsSync(path.join(root, "1.14.0/src/WeakAuras/Init.lua"))).toBe(true);

    await first.cache.readText("v1.14.0", "WeakAuras/Init.lua");
    expect(first.calls.filter((u) => u.includes("cdn.jsdelivr.net"))).toHaveLength(1);

    const second = open({ jsDelivrDown: true });
    expect(await second.cache.readText("v1.14.0", "WeakAuras/Init.lua")).toBe("-- WeakAuras/Init.lua at v1.14.0\n");
  });

  it("caches a branch's files under its commit SHA", async () => {
    const { cache } = open();
    const { resolution } = await cache.readFile("main", "WeakAuras/Init.lua");
    expect(resolution).toMatchObject({ kind: "branch", ref: MAIN_SHA });
    expect(readFileSync(path.join(root, MAIN_SHA, "src/WeakAuras/Init.lua"), "utf8")).toBe(
      `-- WeakAuras/Init.lua at ${MAIN_SHA}\n`,
    );
  });

  it("fetches a file only once when asked for it concurrently", async () => {
    const { cache, calls } = open();
    await Promise.all([1, 2, 3].map(() => cache.readText("v1.15.0", "README.md")));
    expect(calls.filter((u) => u.includes("cdn.jsdelivr.net"))).toHaveLength(1);
  });

  it("reports missing files and bad paths with HTTP statuses", async () => {
    const { cache } = open();
    await expect(cache.readText("v1.15.0", "WeakAuras/Missing.lua")).rejects.toMatchObject({ status: 404 });
    await expect(cache.readText("v1.15.0", "../secret")).rejects.toMatchObject({ status: 400 });
    await expect(open({ jsDelivrDown: true }).cache.readText(MAIN_SHA, "README.md")).rejects.toMatchObject({ status: 502 });
  });

  it("lists files from GitHub's tree, or jsDelivr's flat listing without GitHub", async () => {
    const gh = await open().cache.listFiles("v1.15.0");
    expect(gh.listing).toMatchObject({ source: "github-tree", complete: true });
    expect(gh.listing.files.map((f) => f.path)).toEqual(["README.md", "WeakAuras/CHANGELOG.md", "WeakAuras/Init.lua"]);

    rmSync(root, { recursive: true, force: true });
    const jsd = await open({ githubDown: true }).cache.listFiles("v1.15.0");
    expect(jsd.listing).toMatchObject({ source: "jsdelivr-flat", complete: true });
    expect(jsd.listing.files).toHaveLength(3);
  });
});
