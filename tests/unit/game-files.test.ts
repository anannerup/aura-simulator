/**
 * A game's file list and items (wago.tools ManifestInterfaceData, ItemSparse and Item), per game, from recorded real
 * rows (tests/fixtures/<game>/spells: Forever wowf 1.60.1.70790, TBC wow_anniversary 2.5.6.70577).
 */
import { describe, expect, it } from "vitest";
import { FOREVER_SPELLS } from "@/games/forever/sources";
import { TBC_SPELLS } from "@/games/tbc/sources";
import { createGameFiles } from "@/server/game-files";
import { createItemCache, UnknownIconError } from "@/server/items";
import { parseSearchPage } from "@/server/name-search";
import type { SpellSource } from "@/server/spells";
import { createFixtureFetch } from "../fixtures/forever/spells/fixture-fetch";
import { createTbcFixtureFetch } from "../fixtures/tbc/spells/fixture-fetch";

const GAMES: { game: string; source: SpellSource; fixtures: () => ReturnType<typeof createFixtureFetch>; build: string; wowhead: string }[] = [
  { game: "forever", source: FOREVER_SPELLS, fixtures: () => createFixtureFetch(), build: "1.60.1.70790", wowhead: "classic" },
  { game: "tbc", source: TBC_SPELLS, fixtures: () => createTbcFixtureFetch(), build: "2.5.6.70577", wowhead: "tbc" },
];

function caches(source: SpellSource, fixtures: ReturnType<typeof createFixtureFetch>) {
  const files = createGameFiles({ source, dbPath: ":memory:", fetch: fixtures.fetch });
  const items = createItemCache({ source, files, dbPath: ":memory:", fetch: fixtures.fetch });
  return { files, items };
}

describe.each(GAMES)("$game", ({ source, fixtures: makeFixtures, build, wowhead }) => {
  it("downloads the file list on first use, once, and resolves paths the way the game does", async () => {
    const fixtures = makeFixtures();
    const { files } = caches(source, fixtures);
    expect(files.status().synced).toBe(false);
    const [a, b] = await Promise.all([
      files.lookup({ paths: ["Interface\\Cursor\\Cast", "interface/cursor/CAST.blp", "Interface\\Icons\\INV_Misc_Food_86_Basilisk"] }),
      files.lookup({ paths: ["Interface\\Buttons\\WHITE8X8.tga", "Interface\\Nowhere\\Nothing"], ids: [131015, 1] }),
    ]);
    expect(a.build).toBe(build);
    expect(a.paths).toEqual({
      "Interface\\Cursor\\Cast": { id: 131015, path: "Interface\\CURSOR\\Cast.blp" },
      "interface/cursor/CAST.blp": { id: 131015, path: "Interface\\CURSOR\\Cast.blp" },
      "Interface\\Icons\\INV_Misc_Food_86_Basilisk": { id: 134042, path: "Interface\\ICONS\\INV_Misc_Food_86_Basilisk.blp" },
    });
    expect(b.paths["Interface\\Buttons\\WHITE8X8.tga"]?.id).toBe(130871);
    expect(b.paths["Interface\\Nowhere\\Nothing"]).toBeNull();
    expect(b.ids).toEqual({ 131015: { id: 131015, path: "Interface\\CURSOR\\Cast.blp" }, 1: null });
    expect(fixtures.calls.filter((u) => u.includes("ManifestInterfaceData"))).toHaveLength(1);
  });

  it("finds icons by the words of their name or by path, with the path an aura writes", async () => {
    const { files } = caches(source, makeFixtures());
    const basilisk = await files.searchIcons("food basilisk");
    expect(basilisk.results).toEqual([
      {
        id: 134042,
        name: "inv_misc_food_86_basilisk",
        path: "Interface\\Icons\\INV_Misc_Food_86_Basilisk",
        iconUrl: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_food_86_basilisk.jpg",
      },
    ]);
    expect((await files.searchIcons("Interface\\Icons\\INV_Misc_Food_86_Basilisk.blp")).results[0]?.id).toBe(134042);
    const potions = await files.searchIcons("potion", { limit: 2 });
    expect(potions.total).toBeGreaterThan(2);
    expect(potions.results).toHaveLength(2);
    expect((await files.searchIcons("cast")).total).toBe(0); // Interface\Cursor isn't an icon
  });

  it("searches items by name or ID, with icons and the game's Wowhead link", async () => {
    const { items } = caches(source, makeFixtures());
    const mana = await items.search("mana potion");
    expect(mana.build).toBe(build);
    expect(mana.results[0]).toEqual({
      id: 3827,
      name: "Mana Potion",
      quality: 1,
      qualityName: "Common",
      itemLevel: 32,
      classId: 0,
      subclassId: 1,
      iconFileId: 134852,
      icon: "inv_potion_72",
      iconPath: "Interface\\Icons\\INV_Potion_72",
      iconUrl: "https://wow.zamimg.com/images/wow/icons/large/inv_potion_72.jpg",
      wowhead: `https://www.wowhead.com/${wowhead}/item=3827`,
    });
    expect(mana.results.map((r) => r.name)).toEqual(expect.arrayContaining(["Greater Mana Potion", "Major Mana Potion"]));
    expect((await items.search("6948")).results[0]).toMatchObject({ id: 6948, name: "Hearthstone", icon: "inv_misc_rune_01" });
    expect(await items.lookup(6948)).toMatchObject({ name: "Hearthstone", iconFileId: 134414, iconPath: expect.stringMatching(/^Interface\\Icons\\INV_Misc_Rune_01$/i) });
    expect(await items.lookup(999999999)).toBeNull();
  });

  it("pages icon and item searches alike with offset and limit", async () => {
    const { files, items } = caches(source, makeFixtures());
    const all = await files.searchIcons("potion", { limit: 100 });
    expect(all).toMatchObject({ offset: 0, limit: 100 });
    expect(all.results).toHaveLength(all.total);
    const pages = [];
    for (let offset = 0; offset < all.total; offset += 2) {
      const page = await files.searchIcons("potion", { offset, limit: 2 });
      expect(page).toMatchObject({ offset, limit: 2, total: all.total });
      pages.push(...page.results);
    }
    expect(pages).toEqual(all.results);
    expect((await files.searchIcons("potion", { offset: all.total })).results).toEqual([]);

    const potions = await items.search("potion", { limit: 100 });
    const second = await items.search("potion", { offset: 1, limit: 1 });
    expect(second).toMatchObject({ offset: 1, limit: 1, total: potions.total, icon: null });
    expect(second.results).toEqual([potions.results[1]]);
  });

  it("finds the items that use an icon, by FileDataID, path or name, with or without a name query", async () => {
    const { items } = caches(source, makeFixtures());
    for (const icon of ["134852", "Interface\\Icons\\INV_Potion_72.blp", "interface/icons/inv_potion_72", "INV_Potion_72"]) {
      const found = await items.search("", { icon });
      expect(found.icon).toEqual({ id: 134852, name: "inv_potion_72", path: "Interface\\Icons\\INV_Potion_72", iconUrl: expect.any(String) });
      expect(found.results.map((r) => r.id)).toEqual([3827]);
      expect(found.total).toBe(1);
    }
    expect((await items.search("mana", { icon: "inv_potion_72" })).results.map((r) => r.name)).toEqual(["Mana Potion"]);
    expect((await items.search("hearthstone", { icon: "inv_potion_72" })).total).toBe(0);
    await expect(items.search("", { icon: "no_such_icon" })).rejects.toThrow(UnknownIconError);
    await expect(items.search("", { icon: "131015" })).rejects.toThrow(/no icon "131015"/); // Interface\Cursor\Cast
  });

  it("lists the texture files outside Interface\\Icons by the words of their path, and says when it downloaded the list", async () => {
    let synced = 0;
    const files = createGameFiles({ source, dbPath: ":memory:", fetch: makeFixtures().fetch, onSynced: () => synced++ });
    const all = await files.listTextures(null);
    expect(synced).toBe(1);
    expect(all.map((f) => f.path)).toContain("Interface\\CURSOR\\Cast.blp");
    expect(all.every((f) => !/\\icons\\/i.test(f.path) && /\.(blp|tga)$/i.test(f.path))).toBe(true);
    expect((await files.listTextures("cursor cast")).map((f) => f.id)).toEqual([131015]);
    expect((await files.listTextures("Interface\\Cursor\\Cast")).map((f) => f.id)).toEqual([131015]);
    expect(await files.listTextures("basilisk")).toEqual([]);
  });
});

describe("search pages", () => {
  it("reads offset and limit from a query, clamping the limit and refusing what isn't a number", () => {
    const parse = (q: string) => parseSearchPage(new URLSearchParams(q));
    expect(parse("")).toEqual({ offset: 0, limit: 20 });
    expect(parse("offset=40&limit=500")).toEqual({ offset: 40, limit: 100 });
    expect(parse("limit=0")).toEqual({ offset: 0, limit: 1 });
    expect(parse("limit=x")).toEqual({ error: expect.stringMatching(/limit/) });
    expect(parse("offset=-1")).toEqual({ error: expect.stringMatching(/offset/) });
    expect(parse("offset=1.5")).toEqual({ error: expect.stringMatching(/offset/) });
  });
});

it("a TBC item is TBC's: Blackened Basilisk with the basilisk icon", async () => {
  const { items } = caches(TBC_SPELLS, createTbcFixtureFetch());
  expect((await items.search("basilisk")).results).toEqual([
    expect.objectContaining({ id: 27657, name: "Blackened Basilisk", iconFileId: 134042, wowhead: "https://www.wowhead.com/tbc/item=27657" }),
  ]);
});

it("refuses a database another game's product filled", async () => {
  const dir = await import("node:os").then((os) => os.tmpdir());
  const dbPath = `${dir}/aurasim-files-${process.pid}-${Date.now()}.sqlite`;
  const files = createGameFiles({ source: TBC_SPELLS, dbPath, fetch: createTbcFixtureFetch().fetch });
  await files.ready();
  files.close();
  expect(() => createGameFiles({ source: FOREVER_SPELLS, dbPath })).toThrow(/holds wow_anniversary files, not wowf/);
});
