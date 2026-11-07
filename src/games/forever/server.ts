/** Forever on the server: Musca Auras' tagged source, the `wowf` spell database and Forever's agent docs. */
import path from "node:path";
import { createAddonSourceCache, type AddonSourceCache } from "@/server/addon/source-cache";
import { createUpstreamFixtureFetch } from "@/server/addon/upstream-fixtures";
import { addonCacheDir, addonUpstreamFixtures, gameDataDir, type ServerGame } from "@/server/game";
import { createSpellCache, type SpellCache } from "@/server/spells";
import { forever } from ".";
import { loadAgentDocs } from "./docs/load";
import { FOREVER_ADDON, FOREVER_SPELLS } from "./sources";

// Kept on globalThis so dev hot reloads reuse the caches and the database connection.
const g = globalThis as typeof globalThis & { __forever?: { addon?: AddonSourceCache; spells?: SpellCache } };
const state = (g.__forever ??= {});

export const foreverServer: ServerGame = {
  game: forever,
  get addon() {
    const fixtures = addonUpstreamFixtures(forever.id);
    return (state.addon ??= createAddonSourceCache({
      ...FOREVER_ADDON,
      root: addonCacheDir(forever.id),
      fetch: fixtures ? createUpstreamFixtureFetch(fixtures, FOREVER_ADDON.repo, (input, init) => fetch(input, init)) : undefined,
    }));
  },
  get spells() {
    return (state.spells ??= createSpellCache({ dbPath: path.join(gameDataDir(forever.id), "spells.sqlite"), source: FOREVER_SPELLS }));
  },
  agentDocs: (origin, requestedRef) => loadAgentDocs(foreverServer, origin, requestedRef),
};
