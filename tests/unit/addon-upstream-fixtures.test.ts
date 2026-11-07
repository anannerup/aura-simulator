import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createAddonSourceCache } from "@/server/addon";
import { createUpstreamFixtureFetch } from "@/server/addon/upstream-fixtures";
import { FOREVER_ADDON } from "@/games/forever/sources";

// The e2e dev server's upstream (ADDON_UPSTREAM_FIXTURES): versions and refs from recorded answers.
const fixtures = path.resolve(__dirname, "../fixtures/forever/addon");
let root: string;
let passed: string[];

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "addon-fixtures-"));
  passed = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function open() {
  const fetch = createUpstreamFixtureFetch(fixtures, FOREVER_ADDON.repo, async (url) => {
    passed.push(url);
    return new Response(`-- ${url}\n`);
  });
  return createAddonSourceCache({ ...FOREVER_ADDON, root, fetch });
}

test("version list and releases come from the fixtures; files pass through", async () => {
  const cache = open();
  const list = await cache.versions();
  expect(list).toMatchObject({ defaultRef: "v1.15.0", tagsConfirmed: true });
  expect(await cache.resolve("1.15.0")).toMatchObject({ ref: "v1.15.0", version: "1.15.0" });
  await expect(cache.resolve("main")).rejects.toThrow(/Musca Auras has no release called "main"/);

  const { listing } = await cache.listFiles("v1.10.0");
  expect(listing).toMatchObject({ source: "github-tree", complete: true });
  expect(listing.files.map((f) => f.path)).toContain("WeakAuras/Init.lua");
  expect(passed).toEqual([]);

  await cache.readText("v1.15.0", "WeakAuras/Init.lua");
  expect(passed).toEqual(["https://cdn.jsdelivr.net/gh/dldvlpr-addons-wow/Musca-Auras@v1.15.0/WeakAuras/Init.lua"]);
});
