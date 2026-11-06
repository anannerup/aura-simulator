import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createAddonSourceCache } from "@/server/addon";
import { createUpstreamFixtureFetch } from "@/server/addon/upstream-fixtures";

// The e2e dev server's upstream (ADDON_UPSTREAM_FIXTURES): versions and refs from recorded answers.
const fixtures = path.resolve(__dirname, "../fixtures/addon");
let root: string;
let passed: string[];

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "addon-fixtures-"));
  passed = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function open() {
  const fetch = createUpstreamFixtureFetch(fixtures, async (url) => {
    passed.push(url);
    return new Response(`-- ${url}\n`);
  });
  return createAddonSourceCache({ root, fetch });
}

test("version list, releases, branches and commits come from the fixtures; files pass through", async () => {
  const cache = open();
  const list = await cache.versions();
  expect(list).toMatchObject({ defaultRef: "v1.15.0", tagsConfirmed: true });
  expect(list.branches).toContain("main");
  expect(await cache.resolve("1.15.0")).toMatchObject({ kind: "release", ref: "v1.15.0" });
  expect(await cache.resolve("main")).toMatchObject({ kind: "branch", ref: "448b7b3886fe7f76b45ce1ae067085ac526a2d95" });
  expect(await cache.resolve("448b7b3")).toMatchObject({ kind: "commit", ref: "448b7b3886fe7f76b45ce1ae067085ac526a2d95" });
  await expect(cache.resolve("no-such-branch")).rejects.toThrow(/no release, branch or commit/);

  const { listing } = await cache.listFiles("v1.10.0");
  expect(listing).toMatchObject({ source: "github-tree", complete: true });
  expect(listing.files.map((f) => f.path)).toContain("WeakAuras/Init.lua");
  expect(passed).toEqual([]);

  await cache.readText("v1.15.0", "WeakAuras/Init.lua");
  expect(passed).toEqual(["https://cdn.jsdelivr.net/gh/dldvlpr-addons-wow/Musca-Auras@v1.15.0/WeakAuras/Init.lua"]);
});
