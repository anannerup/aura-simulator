import { createFixtureFetch, type SpellFixtures } from "../spells/fixture-fetch";

/**
 * TBC Anniversary: real rows from wago.tools build 2.5.6.70577 (product wow_anniversary), trimmed, and real
 * Wowhead TBC tooltip responses (`/tbc/`, `dataEnv=5`), recorded 2026-11-07.
 */
export const TBC_FIXTURES: SpellFixtures = { dir: __dirname, build: "2.5.6.70577", wowheadPath: "tbc" };

/** `createFixtureFetch` over the TBC fixtures. */
export function createTbcFixtureFetch(overrides: Record<string, () => Response> = {}) {
  return createFixtureFetch(overrides, TBC_FIXTURES);
}
