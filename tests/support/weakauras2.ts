import path from "node:path";
import type { AddonSourceFetcher } from "@/core";
import {
  createWeakAuras2FixtureFetch,
  createWeakAuras2ReleaseCache,
  type WeakAuras2ReleaseCache,
} from "@/server/addon/weakauras2-releases";
import type { FetchFn } from "@/server/addon/upstream";

/**
 * WeakAuras2 releases for tests. The release list is a recorded GitHub answer (tests/fixtures/tbc/addon, the layout
 * ADDON_UPSTREAM_FIXTURES reads); the release zip (~10 MB, too big to commit) is downloaded once into
 * `.cache/weakauras2` (gitignored), checked against GitHub's recorded sha256, and unpacked there. The e2e dev server
 * uses the same folder (ADDON_CACHE_DIR_TBC in playwright.config.ts). Tests that need it skip when it can't be
 * downloaded (offline).
 */
export const TEST_WEAKAURAS2_CACHE_DIR = path.resolve(__dirname, "../../.cache/weakauras2");
export const WEAKAURAS2_FIXTURES = path.resolve(__dirname, "../fixtures/tbc/addon");
/** The release the TBC tests load. */
export const TBC_TEST_VERSION = "5.22.1";

/** GitHub's releases API answered from the recording; everything else (the zip download) goes to `passthrough`. */
export function weakAuras2FixtureFetch(passthrough: FetchFn): FetchFn {
  return createWeakAuras2FixtureFetch(WEAKAURAS2_FIXTURES, passthrough);
}

let cache: WeakAuras2ReleaseCache | undefined;

export function testWeakAuras2Cache(): WeakAuras2ReleaseCache {
  cache ??= createWeakAuras2ReleaseCache({
    root: TEST_WEAKAURAS2_CACHE_DIR,
    fetch: weakAuras2FixtureFetch((input, init) => fetch(input, init)),
  });
  return cache;
}

/** Unpacks the release (downloading it on first use); false when that fails (no network and nothing cached). */
export async function weakAuras2Available(version = TBC_TEST_VERSION): Promise<boolean> {
  try {
    await testWeakAuras2Cache().ensure(version);
    return true;
  } catch (e) {
    console.warn(`WeakAuras ${version} is not available, skipping its tests: ${(e as Error).message}`);
    return false;
  }
}

export function weakAuras2Fetcher(version = TBC_TEST_VERSION): AddonSourceFetcher {
  return testWeakAuras2Cache().fetcher(version);
}
