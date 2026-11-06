import path from "node:path";
import { createAddonSourceCache, type AddonSourceCache } from "./source-cache";
import { createUpstreamFixtureFetch } from "./upstream-fixtures";

export * from "./source-cache";
export * from "./refs";
export * from "./diff";
export { clientSpells, MAX_CLIENT_SPELL_IDS } from "./client-spells";
export { buildAddonBundle, getEncodedAddonBundle, type EncodedAddonBundle } from "./bundle";
export type { OptionTable, OptionTables } from "./option-tables";
export type { FetchFn, FileListing } from "./remote";

/** Default cache directory: `<repo>/data/addon`, overridable with ADDON_CACHE_DIR. */
export function defaultAddonCacheDir(): string {
  return process.env.ADDON_CACHE_DIR ?? path.join(process.cwd(), "data", "addon");
}

const globalForCache = globalThis as typeof globalThis & { __addonSourceCache?: AddonSourceCache };

/**
 * The app's shared addon source cache (kept on globalThis so dev hot reloads reuse its memory).
 * With ADDON_UPSTREAM_FIXTURES=<dir> (tests), version lists and ref resolution come from recorded
 * GitHub/jsDelivr answers in that directory instead of the network (see upstream-fixtures.ts).
 */
export function getAddonSourceCache(): AddonSourceCache {
  const fixtures = process.env.ADDON_UPSTREAM_FIXTURES;
  globalForCache.__addonSourceCache ??= createAddonSourceCache({
    root: defaultAddonCacheDir(),
    fetch: fixtures
      ? createUpstreamFixtureFetch(path.resolve(fixtures), (input, init) => fetch(input, init))
      : undefined,
  });
  return globalForCache.__addonSourceCache;
}
