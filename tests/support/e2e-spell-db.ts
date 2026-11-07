import { mkdirSync } from "node:fs";
import path from "node:path";
import { createSpellCache, type SpellSource } from "@/server/spells";
import { FOREVER_SPELLS } from "@/games/forever/sources";
import { TBC_SPELLS } from "@/games/tbc/sources";
import { createFixtureFetch } from "../fixtures/forever/spells/fixture-fetch";
import { createTbcFixtureFetch } from "../fixtures/tbc/spells/fixture-fetch";

/** The data directory the e2e dev server uses (passed as DATA_DIR), one per port. */
export function e2eDataDir(port: number): string {
  return path.resolve(__dirname, "../../.cache/e2e", String(port));
}

/** A game's spell database in it (the server's layout: `<DATA_DIR>/<game>/spells.sqlite`). */
export function e2eSpellDbPath(port: number, game: "forever" | "tbc" = "forever"): string {
  return path.join(e2eDataDir(port), game, "spells.sqlite");
}

interface SpellSeed {
  source: SpellSource;
  fixtures: { fetch: (input: string) => Promise<Response> };
  /** Spell IDs in the recorded wago fixtures, plus 99999999 (recorded as unknown to Wowhead). */
  ids: number[];
}

const SEEDS: Record<"forever" | "tbc", () => SpellSeed> = {
  forever: () => ({
    source: FOREVER_SPELLS,
    fixtures: createFixtureFetch(),
    ids: [99999999, 1, 116, 133, 1243, 1244, 1245, 1459, 1460, 2598, 3964, 9192, 12471, 21088, 21229, 23028, 27115, 431567, 470037, 1215498, 1325147],
  }),
  tbc: () => ({
    source: TBC_SPELLS,
    fixtures: createTbcFixtureFetch(),
    ids: [99999999, 1, 116, 1459, 1460, 2825, 27126, 27127, 32182, 33763, 33891],
  }),
};

/**
 * Fills a game's e2e spell database from recorded fixtures, so the dev server never hits the network:
 * syncs the fixture build and caches a Wowhead answer for every fixture spell (spells without a
 * recorded Wowhead response are cached as "not on Wowhead"). Safe to rerun while the server has it open.
 */
export async function seedE2eSpellDb(dbPath: string, game: "forever" | "tbc" = "forever"): Promise<void> {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const { source, fixtures, ids } = SEEDS[game]();
  const fetchFn = async (input: string) => {
    try {
      return await fixtures.fetch(input);
    } catch (err) {
      if (input.startsWith("https://nether.wowhead.com/")) {
        return new Response(JSON.stringify({ error: "Unknown spell" }), { status: 404 });
      }
      throw err;
    }
  };
  const cache = createSpellCache({ source, dbPath, fetch: fetchFn });
  try {
    await cache.sync();
    for (const id of ids) await cache.lookup(id);
  } finally {
    cache.close();
  }
}
