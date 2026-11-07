import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSpellCache, type SpellCache } from "@/server/spells";
import { FOREVER_SPELLS } from "@/games/forever/sources";
import { createFixtureFetch } from "../fixtures/forever/spells/fixture-fetch";

let dir: string;
let caches: SpellCache[] = [];

function open(fetchFn = createFixtureFetch().fetch, dbFile = "spells.sqlite") {
  const cache = createSpellCache({ source: FOREVER_SPELLS, dbPath: path.join(dir, dbFile), fetch: fetchFn });
  caches.push(cache);
  return cache;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "spell-cache-"));
});
afterEach(() => {
  caches.forEach((c) => c.close());
  caches = [];
  rmSync(dir, { recursive: true, force: true });
});

describe("sync", () => {
  it("loads the latest Forever build's spell list and icon names", async () => {
    const cache = open();
    expect(cache.status()).toMatchObject({ synced: false, build: null, spellCount: 0 });

    const result = await cache.sync();
    expect(result).toMatchObject({ product: "wowf", build: "1.60.1.70790", spellCount: 20 });
    // Spells without a SpellMisc row (1215498) or with an icon outside ManifestInterfaceData (431567) have no icon.
    expect(result.spellsWithIcon).toBe(18);

    expect(cache.status()).toMatchObject({
      synced: true,
      product: "wowf",
      build: "1.60.1.70790",
      spellCount: 20,
      spellsWithIcon: 18,
      syncedAt: result.syncedAt,
    });
  });

  it("can sync a specific build and survives reopening the database", async () => {
    await open().sync({ build: "1.60.1.70790" });
    const reopened = open(createFixtureFetch().fetch);
    expect(reopened.status()).toMatchObject({ synced: true, build: "1.60.1.70790", spellCount: 20 });
  });

  it("leaves the previous data in place when a download fails", async () => {
    const cache = open();
    await cache.sync();
    const failing = createFixtureFetch({
      "https://wago.tools/db2/SpellMisc": () => new Response("boom", { status: 503 }),
    });
    const broken = open(failing.fetch);
    await expect(broken.sync()).rejects.toThrow(/HTTP 503/);
    expect(broken.status().spellCount).toBe(20);
  });
});

describe("search", () => {
  let cache: SpellCache;
  beforeEach(async () => {
    cache = open();
    await cache.sync();
  });

  it("ranks exact names first, then prefixes, then other matches", () => {
    const { results, build } = cache.search("arcane intellect");
    expect(build).toBe("1.60.1.70790");
    expect(results.map((r) => r.id)).toEqual([1459, 1460, 21088]);
    expect(results[0]).toEqual({
      id: 1459,
      name: "Arcane Intellect",
      icon: "spell_holy_magicalsentry",
      iconUrl: "https://wow.zamimg.com/images/wow/icons/large/spell_holy_magicalsentry.jpg",
    });

    expect(cache.search("arcane").results.map((r) => r.name)).toEqual([
      "Arcane Intellect",
      "Arcane Intellect",
      "Arcane Brilliance",
      "Improved Arcane Intellect",
    ]);
  });

  it("is case-insensitive, matches every word, and handles quotes and commas in names", () => {
    expect(cache.search("FROSTBOLT").results.map((r) => r.id)).toEqual([116, 21229]);
    expect(cache.search("bolt frost").results.map((r) => r.id)).toEqual([116, 21229]);
    expect(cache.search('"impact"').results.map((r) => r.name)).toEqual(['Deprecated BKP "Impact" Shot']);
    expect(cache.search("power word: fort").results.map((r) => r.id)).toEqual([1243, 1244, 1245]);
  });

  it("finds a spell by its numeric ID and treats LIKE wildcards literally", () => {
    expect(cache.search("1459").results[0]).toMatchObject({ id: 1459, name: "Arcane Intellect" });
    expect(cache.search("%").results).toEqual([]);
    expect(cache.search("_").results).toEqual([]);
  });

  it("limits results and returns nothing for an empty query", () => {
    const cut = cache.search("a", { limit: 2 });
    expect(cut.results).toHaveLength(2);
    // The answer says how many match, so a caller knows the list was cut.
    expect(cut).toMatchObject({ limit: 2 });
    expect(cut.total).toBeGreaterThan(2);
    expect(cut.total).toBe(cache.search("a", { limit: 100 }).total);
    expect(cache.search("frostbolt")).toMatchObject({ limit: 20, total: 2 });
    expect(cache.search("   ")).toMatchObject({ results: [], total: 0 });
  });
});

describe("lookup", () => {
  it("combines Forever data with Wowhead's tooltip and caches the tooltip", async () => {
    const recorder = createFixtureFetch();
    const cache = open(recorder.fetch);
    await cache.sync();
    recorder.calls.length = 0;

    const spell = await cache.lookup(1459);
    expect(spell).toMatchObject({
      id: 1459,
      found: true,
      name: "Arcane Intellect",
      icon: "spell_holy_magicalsentry",
      iconUrl: "https://wow.zamimg.com/images/wow/icons/large/spell_holy_magicalsentry.jpg",
      source: { name: "wago", icon: "wago", tooltip: "wowhead" },
      inGame: { name: "Arcane Intellect", icon: "spell_holy_magicalsentry", iconFileId: 135932 },
      wowhead: { status: "found", name: "Arcane Intellect", icon: "spell_holy_magicalsentry" },
      flags: [],
    });
    expect(spell.tooltip).toContain("Increases the target's Intellect by 2 for 30 min.");
    expect(spell.buff).toContain("Increases Intellect by 2.");
    expect(recorder.calls).toHaveLength(1);

    // Second lookup, even from a fresh process, comes from SQLite.
    const offline = open(async () => {
      throw new TypeError("offline");
    });
    expect(await offline.lookup(1459)).toEqual(spell);
    expect(offline.status().wowhead).toEqual({ found: 1, notFound: 0 });
  });

  it("flags spells Wowhead doesn't know and caches that answer", async () => {
    const recorder = createFixtureFetch();
    const cache = open(recorder.fetch);
    await cache.sync();
    const tent = await cache.lookup(1325147);
    expect(tent).toMatchObject({
      found: true,
      name: "Adventurer's Tent",
      icon: "inv_10_tailoring2_tent_color3",
      tooltip: null,
      wowhead: { status: "not_found" },
      flags: ["not-on-wowhead"],
    });
    const calls = recorder.calls.length;
    await cache.lookup(1325147);
    expect(recorder.calls.length).toBe(calls);
    expect(cache.status().wowhead).toEqual({ found: 0, notFound: 1 });
  });

  it("flags an icon that differs between Forever and Wowhead, keeping Forever's", async () => {
    const cache = open();
    await cache.sync();
    // Forever's icon file is TEMP.BLP; Wowhead calls its Classic placeholder "classic_temp".
    expect(await cache.lookup(1)).toMatchObject({
      name: "Word of Recall (OLD)",
      icon: "temp",
      wowhead: { icon: "classic_temp" },
      flags: ["icon-mismatch"],
    });
  });

  it("flags a name that differs between Forever and Wowhead", async () => {
    // Real Wowhead response for 1459, renamed to simulate a Forever-only rename.
    const recorded = createFixtureFetch();
    const renamed = createFixtureFetch({
      "https://nether.wowhead.com/classic/tooltip/spell/1459": () =>
        new Response(JSON.stringify({ name: "Arcane Wit", icon: "spell_holy_magicalsentry", tooltip: "<b>x</b>" })),
    });
    await open(recorded.fetch).sync();
    const spell = await open(renamed.fetch).lookup(1459);
    expect(spell).toMatchObject({ name: "Arcane Intellect", wowhead: { name: "Arcane Wit" }, flags: ["name-mismatch"] });
  });

  it("serves Forever data and retries Wowhead later when Wowhead is unreachable", async () => {
    const cache = open();
    await cache.sync();
    // No Wowhead fixture for 116, so the fixture fetch fails like a network error.
    const frostbolt = await cache.lookup(116);
    expect(frostbolt).toMatchObject({
      found: true,
      name: "Frostbolt",
      icon: "spell_frost_frostbolt02",
      tooltip: null,
      wowhead: { status: "unavailable" },
      flags: ["wowhead-unavailable"],
    });
    expect(cache.status().wowhead).toEqual({ found: 0, notFound: 0 });
  });

  it("can skip Wowhead entirely", async () => {
    const recorder = createFixtureFetch();
    const cache = open(recorder.fetch);
    await cache.sync();
    recorder.calls.length = 0;
    expect(await cache.lookup(1459, { fetchWowhead: false })).toMatchObject({
      name: "Arcane Intellect",
      tooltip: null,
      wowhead: { status: "not_fetched" },
      flags: [],
    });
    expect(recorder.calls).toEqual([]);
  });

  it("flags spells with no icon", async () => {
    const cache = open();
    await cache.sync();
    expect(await cache.lookup(1215498, { fetchWowhead: false })).toMatchObject({
      name: "Caustic Emanations",
      icon: null,
      iconUrl: null,
      flags: ["no-icon"],
    });
  });

  it("marks IDs that neither source knows as unknown", async () => {
    const cache = open();
    await cache.sync();
    expect(await cache.lookup(99999999)).toMatchObject({
      found: false,
      name: null,
      inGame: null,
      wowhead: { status: "not_found" },
      flags: ["unknown"],
    });
  });

  it("uses Wowhead's name and icon for a spell missing from Forever, flagged", async () => {
    const cache = open();
    await cache.sync({ build: "1.60.1.70790" });
    // Simulate a Wowhead-known ID outside the Forever list with the real 1459 response.
    const shifted = createFixtureFetch({
      "https://nether.wowhead.com/classic/tooltip/spell/424242": () =>
        new Response(JSON.stringify({ name: "Arcane Intellect", icon: "spell_holy_magicalsentry", tooltip: "<b>x</b>" })),
    });
    const spell = await open(shifted.fetch).lookup(424242);
    expect(spell).toMatchObject({
      found: true,
      name: "Arcane Intellect",
      icon: "spell_holy_magicalsentry",
      source: { name: "wowhead", icon: "wowhead", tooltip: "wowhead" },
      inGame: null,
      flags: ["not-in-game"],
    });
  });

  it("says when the cache was never synced", async () => {
    const cache = open();
    expect(await cache.lookup(1459)).toMatchObject({ found: true, name: "Arcane Intellect", flags: ["not-synced"] });
  });

  it("rejects invalid IDs", async () => {
    const cache = open();
    await expect(cache.lookup(0)).rejects.toThrow(RangeError);
    await expect(cache.lookup(1.5)).rejects.toThrow(RangeError);
  });
});

describe("icons", () => {
  it("maps Interface\\ICONS FileDataIDs and spell IDs to icon names", async () => {
    const cache = open();
    expect(cache.icons({ files: [135932], spells: [1459] })).toEqual({ files: { 135932: null }, spells: { 1459: null } });
    await cache.sync();
    expect(cache.icons({ files: [135932, 304287, 130646, 5588107, 0], spells: [1459, 116, 431567, 1215498] })).toEqual({
      files: { 135932: "spell_holy_magicalsentry", 304287: "inv_staff_99", 130646: null, 5588107: null },
      spells: { 1459: "spell_holy_magicalsentry", 116: "spell_frost_frostbolt02", 431567: null, 1215498: null },
    });
  });

  it("falls back to a cached Wowhead icon for spells outside Forever", async () => {
    const cache = open(
      createFixtureFetch({
        "https://nether.wowhead.com/classic/tooltip/spell/424242": () =>
          new Response(JSON.stringify({ name: "X", icon: "Spell_Holy_MagicalSentry", tooltip: "x" })),
      }).fetch,
    );
    await cache.sync();
    expect(cache.icons({ spells: [424242] }).spells[424242]).toBeNull();
    await cache.lookup(424242);
    expect(cache.icons({ spells: [424242] }).spells[424242]).toBe("spell_holy_magicalsentry");
  });
});
