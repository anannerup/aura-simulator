import path from "node:path";
import type { AddonSourceFetcher } from "@/core";
import { FOREVER_ADDON } from "@/games/forever/sources";
import { createAddonSourceCache } from "@/server/addon/source-cache";
import { createUpstreamFixtureFetch } from "@/server/addon/upstream-fixtures";

/** Where tests keep addon files: the server's addon source caches (`<dir>/<game>`), shared by unit and e2e tests (gitignored). */
export const TEST_ADDON_CACHE_DIR = path.resolve(__dirname, "../../.cache/addon");
/** Recorded GitHub/jsDelivr version lists per game (`<dir>/<game>/addon`), so releases resolve without the network. */
export const ADDON_UPSTREAM_FIXTURES = path.resolve(__dirname, "../fixtures");

let cache: ReturnType<typeof createAddonSourceCache> | undefined;

/** Reads files of a real Musca Auras release through the server's source cache: each file is downloaded once. */
export function cachedAddonFetcher(ref: string): AddonSourceFetcher {
  cache ??= createAddonSourceCache({
    ...FOREVER_ADDON,
    root: path.join(TEST_ADDON_CACHE_DIR, "forever"),
    fetch: createUpstreamFixtureFetch(path.join(ADDON_UPSTREAM_FIXTURES, "forever", "addon"), FOREVER_ADDON.repo, (input, init) =>
      fetch(input, init),
    ),
  });
  return (file) => cache!.readText(ref, file);
}
