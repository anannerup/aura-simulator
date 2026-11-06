import path from "node:path";
import { createAddonSourceCache, type AddonSourceCache } from "./source-cache";

export * from "./source-cache";
export * from "./refs";
export * from "./diff";
export type { OptionTable, OptionTables } from "./option-tables";
export type { FetchFn, FileListing } from "./remote";

/** Default cache directory: `<repo>/data/addon`, overridable with ADDON_CACHE_DIR. */
export function defaultAddonCacheDir(): string {
  return process.env.ADDON_CACHE_DIR ?? path.join(process.cwd(), "data", "addon");
}

const globalForCache = globalThis as typeof globalThis & { __addonSourceCache?: AddonSourceCache };

/** The app's shared addon source cache (kept on globalThis so dev hot reloads reuse its memory). */
export function getAddonSourceCache(): AddonSourceCache {
  globalForCache.__addonSourceCache ??= createAddonSourceCache({ root: defaultAddonCacheDir() });
  return globalForCache.__addonSourceCache;
}
