import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSpellCache, FOREVER_SPELLS, TBC_SPELLS, type SpellCache } from "@/server/spells";
import { createFixtureFetch } from "../fixtures/spells/fixture-fetch";
import { createTbcFixtureFetch } from "../fixtures/spells-tbc/fixture-fetch";

// TBC Anniversary's spell database: wago `wow_anniversary`, Wowhead `/tbc/` with dataEnv=5, its own file.

let dir: string;
let caches: SpellCache[] = [];

function open(fetchFn = createTbcFixtureFetch().fetch, dbFile = TBC_SPELLS.dbFile) {
  const cache = createSpellCache({ source: TBC_SPELLS, dbPath: path.join(dir, dbFile), fetch: fetchFn });
  caches.push(cache);
  return cache;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "spell-cache-tbc-"));
});
afterEach(() => {
  caches.forEach((c) => c.close());
  caches = [];
  rmSync(dir, { recursive: true, force: true });
});

describe("TBC sync", () => {
  it("loads the latest wow_anniversary build's spell list and icon names", async () => {
    const recorder = createTbcFixtureFetch();
    const cache = open(recorder.fetch);
    const result = await cache.sync();
    expect(result).toMatchObject({ product: "wow_anniversary", build: "2.5.6.70577", spellCount: 10, spellsWithIcon: 10 });
    expect(cache.status()).toMatchObject({ synced: true, product: "wow_anniversary", build: "2.5.6.70577", spellCount: 10 });
    expect(recorder.calls).toContain("https://wago.tools/db2/SpellName/csv?build=2.5.6.70577");

    expect(cache.search("lifebloom").results).toEqual([
      {
        id: 33763,
        name: "Lifebloom",
        icon: "inv_misc_herb_felblossom",
        iconUrl: "https://wow.zamimg.com/images/wow/icons/large/inv_misc_herb_felblossom.jpg",
      },
    ]);
    // TBC ranks Forever doesn't have.
    expect(cache.search("arcane intellect").results.map((r) => r.id)).toEqual([1459, 1460, 27126]);
  });

  it("refuses a database file another game's sync filled", async () => {
    const forever = createSpellCache({ source: FOREVER_SPELLS, dbPath: path.join(dir, "shared.sqlite"), fetch: createFixtureFetch().fetch });
    await forever.sync();
    forever.close();
    expect(() => open(createTbcFixtureFetch().fetch, "shared.sqlite")).toThrow(/holds wowf spells, not wow_anniversary/);
  });
});

describe("TBC lookup", () => {
  it("combines TBC client data with Wowhead's TBC tooltip", async () => {
    const recorder = createTbcFixtureFetch();
    const cache = open(recorder.fetch);
    await cache.sync();
    recorder.calls.length = 0;

    const spell = await cache.lookup(33763);
    expect(spell).toMatchObject({
      id: 33763,
      found: true,
      name: "Lifebloom",
      icon: "inv_misc_herb_felblossom",
      source: { name: "wago", icon: "wago", tooltip: "wowhead" },
      inGame: { name: "Lifebloom", icon: "inv_misc_herb_felblossom", iconFileId: 134206 },
      wowhead: { status: "found", name: "Lifebloom", icon: "inv_misc_herb_felblossom" },
      flags: [],
    });
    expect(spell.tooltip).toContain('href="/tbc/spell=33763/lifebloom"');
    expect(spell.tooltip).toContain("Heals the target for 273 over 7 sec.");
    expect(recorder.calls).toEqual(["https://nether.wowhead.com/tbc/tooltip/spell/33763?dataEnv=5&locale=0"]);
  });

  it("flags a spell Wowhead TBC knows but the TBC client doesn't as not in the game", async () => {
    const cache = open(
      createTbcFixtureFetch({
        "https://nether.wowhead.com/tbc/tooltip/spell/424242": () =>
          new Response(JSON.stringify({ name: "Lifebloom", icon: "inv_misc_herb_felblossom", tooltip: "<b>x</b>" })),
      }).fetch,
    );
    await cache.sync();
    expect(await cache.lookup(424242)).toMatchObject({ found: true, name: "Lifebloom", inGame: null, flags: ["not-in-game"] });
    expect(await cache.lookup(99999999)).toMatchObject({ found: false, inGame: null, wowhead: { status: "not_found" }, flags: ["unknown"] });
  });
});
