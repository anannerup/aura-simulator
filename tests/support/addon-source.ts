import path from "node:path";
import type { AddonSourceFetcher } from "@/core";
import { createAddonSourceCache } from "@/server/addon/source-cache";
import { createUpstreamFixtureFetch } from "@/server/addon/upstream-fixtures";

/** Where tests keep addon files: the server's addon source cache layout, shared by unit and e2e tests (gitignored). */
export const TEST_ADDON_CACHE_DIR = path.resolve(__dirname, "../../.cache/addon");
/** Recorded GitHub/jsDelivr version lists, so refs resolve without the network (see upstream-fixtures.ts). */
export const ADDON_UPSTREAM_FIXTURES = path.resolve(__dirname, "../fixtures/addon");

let cache: ReturnType<typeof createAddonSourceCache> | undefined;

/** Reads files of a real addon version through the server's source cache: each file is downloaded once. */
export function cachedAddonFetcher(ref: string): AddonSourceFetcher {
  cache ??= createAddonSourceCache({
    root: TEST_ADDON_CACHE_DIR,
    fetch: createUpstreamFixtureFetch(ADDON_UPSTREAM_FIXTURES, (input, init) => fetch(input, init)),
  });
  return (file) => cache!.readText(ref, file);
}
