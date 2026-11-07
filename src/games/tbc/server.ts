/** TBC Anniversary on the server: WeakAuras2's release zips, the `wow_anniversary` spell database and TBC's agent docs. */
import path from "node:path";
import type { AddonSourceCache } from "@/server/addon/source-cache";
import {
  createWeakAuras2FixtureFetch,
  createWeakAuras2ReleaseCache,
  weakAuras2AddonSource,
} from "@/server/addon/weakauras2-releases";
import { addonCacheDir, addonUpstreamFixtures, gameDataDir, type ServerGame } from "@/server/game";
import { createSpellCache, type SpellCache } from "@/server/spells";
import { tbc } from ".";
import { loadTbcAgentDocs } from "./docs/load";
import { TBC_SPELLS } from "./sources";

// Kept on globalThis so dev hot reloads reuse the caches and the database connection.
const g = globalThis as typeof globalThis & { __tbc?: { addon?: AddonSourceCache; spells?: SpellCache } };
const state = (g.__tbc ??= {});

export const tbcServer: ServerGame = {
  game: tbc,
  get addon() {
    const fixtures = addonUpstreamFixtures(tbc.id);
    return (state.addon ??= weakAuras2AddonSource(
      createWeakAuras2ReleaseCache({
        root: addonCacheDir(tbc.id),
        fetch: fixtures ? createWeakAuras2FixtureFetch(fixtures, (input, init) => fetch(input, init)) : undefined,
      }),
    ));
  },
  get spells() {
    return (state.spells ??= createSpellCache({ dbPath: path.join(gameDataDir(tbc.id), "spells.sqlite"), source: TBC_SPELLS }));
  },
  agentDocs: (origin, requestedRef) => loadTbcAgentDocs(tbcServer, origin, requestedRef),
};
