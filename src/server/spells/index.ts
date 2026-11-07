import path from "node:path";
import { createSpellCache, type SpellCache } from "./spell-cache";
import { FOREVER_SPELLS, type SpellSource } from "./sources";

export * from "./spell-cache";
export { FOREVER_SPELLS, TBC_SPELLS, type FetchFn, type SpellSource } from "./sources";

/** A game's database file: `<repo>/data/<source.dbFile>`, overridable with the source's environment variable. */
export function spellDbPath(source: SpellSource): string {
  return process.env[source.dbPathEnv] ?? path.join(process.cwd(), "data", source.dbFile);
}

const globalForCache = globalThis as typeof globalThis & { __spellCaches?: Map<string, SpellCache> };

/**
 * A game's shared spell cache (Forever's by default), one per game. Kept on globalThis so dev hot reloads
 * reuse the connection.
 */
export function getSpellCache(source: SpellSource = FOREVER_SPELLS): SpellCache {
  const caches = (globalForCache.__spellCaches ??= new Map());
  let cache = caches.get(source.game);
  if (!cache) {
    cache = createSpellCache({ source, dbPath: spellDbPath(source) });
    caches.set(source.game, cache);
  }
  return cache;
}
