import { mkdirSync } from "node:fs";
import path from "node:path";
import { createSpellCache, FOREVER_SPELLS } from "@/server/spells";
import { createFixtureFetch } from "../fixtures/spells/fixture-fetch";

/** The spell database the e2e dev server uses (passed as SPELL_DB_PATH), one per port. */
export function e2eSpellDbPath(port: number): string {
  return path.resolve(__dirname, "../../.cache/e2e", `spells-${port}.sqlite`);
}

/** Spell IDs in the recorded wago fixtures, plus 99999999 (recorded as unknown to Wowhead). */
const FIXTURE_SPELL_IDS = [99999999, 1, 116, 133, 1243, 1244, 1245, 1459, 1460, 2598, 3964, 9192, 12471, 21088, 21229, 23028, 27115, 431567, 470037, 1215498, 1325147];

/**
 * Fills the e2e spell database from recorded fixtures, so the dev server never hits the network:
 * syncs the fixture build and caches a Wowhead answer for every fixture spell (spells without a
 * recorded Wowhead response are cached as "not on Wowhead"). Safe to rerun while the server has it open.
 */
export async function seedE2eSpellDb(dbPath: string): Promise<void> {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const fixtures = createFixtureFetch();
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
  const cache = createSpellCache({ source: FOREVER_SPELLS, dbPath, fetch: fetchFn });
  try {
    await cache.sync();
    for (const id of FIXTURE_SPELL_IDS) await cache.lookup(id);
  } finally {
    cache.close();
  }
}
