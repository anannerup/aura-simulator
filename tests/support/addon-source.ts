import path from "node:path";
import type { AddonSourceFetcher } from "@/core";
import { FOREVER_ADDON } from "@/games/forever/sources";
import { createAddonSourceCache, type AddonSourceCache } from "@/server/addon/source-cache";
import { createUpstreamFixtureFetch } from "@/server/addon/upstream-fixtures";

/** Where tests keep addon files: the server's addon source caches (`<dir>/<game>`), shared by unit and e2e tests (gitignored). */
export const TEST_ADDON_CACHE_DIR = path.resolve(__dirname, "../../.cache/addon");
/** Recorded GitHub/jsDelivr version lists per game (`<dir>/<game>/addon`), so releases resolve without the network. */
export const ADDON_UPSTREAM_FIXTURES = path.resolve(__dirname, "../fixtures");

let cache: AddonSourceCache | undefined;

/**
 * Musca Auras' releases through the server's source cache, as the e2e server has it (same folder and recorded
 * answers): each file is downloaded once.
 */
export function testForeverAddonSource(): AddonSourceCache {
  return (cache ??= createAddonSourceCache({
    ...FOREVER_ADDON,
    root: path.join(TEST_ADDON_CACHE_DIR, "forever"),
    fetch: createUpstreamFixtureFetch(path.join(ADDON_UPSTREAM_FIXTURES, "forever", "addon"), FOREVER_ADDON.repo, (input, init) =>
      fetch(input, init),
    ),
  }));
}

/** Reads files of a real Musca Auras release through the server's source cache: each file is downloaded once. */
export function cachedAddonFetcher(ref: string): AddonSourceFetcher {
  return (file) => testForeverAddonSource().readText(ref, file);
}
