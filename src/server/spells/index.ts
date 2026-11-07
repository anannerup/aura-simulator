import path from "node:path";
import { createSpellCache, type SpellCache } from "./spell-cache";

export * from "./spell-cache";
export { type FetchFn } from "./sources";

/** Default database file: `<repo>/data/spells.sqlite`, overridable with SPELL_DB_PATH. */
function defaultSpellDbPath(): string {
  return process.env.SPELL_DB_PATH ?? path.join(process.cwd(), "data", "spells.sqlite");
}

const globalForCache = globalThis as typeof globalThis & { __spellCache?: SpellCache };

/** The app's shared spell cache (kept on globalThis so dev hot reloads reuse the connection). */
export function getSpellCache(): SpellCache {
  globalForCache.__spellCache ??= createSpellCache({ dbPath: defaultSpellDbPath() });
  return globalForCache.__spellCache;
}
