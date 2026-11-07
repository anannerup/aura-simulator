/**
 * The e2e server (playwright.config.ts): its environment, and its option references kept in step with the generated
 * cache (tests/support/generated-cache.ts).
 *
 * The server generates a game's option reference on its first request (minutes, in the background) and keeps it on
 * disk, keyed only by OPTION_REFERENCE_FORMAT. Before the tests, each game's kept reference is replaced by the
 * generated cache's for the generator's current code (the key the Vitest suite uses, which replays it); when there is
 * none (that code changed), the kept one is deleted, so the server generates it again during the tests, and after them
 * it goes into the generated cache under the key the run started with. So the e2e server never serves a reference
 * older code made, and generates one only when the code that makes it changed.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AddonGameId } from "@/core";
// (Not "@/core" itself: Playwright can't load the aura core, whose worker host uses import.meta.)
import { OPTION_REFERENCE_FORMAT } from "@/core/addon-vm/option-reference";
import { findGame } from "@/games";
import type { AddonSourceCache } from "@/server/addon/source-cache";
import { weakAuras2AddonSource } from "@/server/addon/weakauras2-releases";
import { testForeverAddonSource } from "./addon-source";
import { e2eDataDir } from "./e2e-spell-db";
import { generatedFile, readGenerated } from "./generated-cache";
import { testWeakAuras2Cache } from "./weakauras2";

const ROOT = path.resolve(__dirname, "../..");

/** The e2e server's environment. */
export function e2eServerEnv(port: number): Record<string, string> {
  return {
    DATA_DIR: e2eDataDir(port),
    // Addon version lists and ref resolution from recorded GitHub/jsDelivr answers (GitHub's unauthenticated rate limit
    // must not fail tests). Addon files are cached on disk across runs (shared by every port and the unit tests), so
    // only the first run downloads them. Live check: LIVE=1, addon-live.test.ts.
    ADDON_UPSTREAM_FIXTURES: path.join(ROOT, "tests/fixtures"),
    ADDON_CACHE_DIR: path.join(ROOT, ".cache/addon"),
    // TBC's WeakAuras2 release zips: the unit tests' cache (tests/support/weakauras2.ts), unpacked by the global setup.
    ADDON_CACHE_DIR_TBC: path.join(ROOT, ".cache/weakauras2"),
    // Wago links answer from recorded import strings (`<id>.txt`); any other id is wago's 404.
    WAGO_FIXTURES: path.join(ROOT, "tests/fixtures/wago"),
  };
}

/** The generator's entry module (its code is hashed into the cache key): the same key the Vitest suite uses. */
const GENERATOR = "src/core/addon-vm/vm.ts";
const cacheKey = (game: AddonGameId, ref: string) => `option-reference-${game}-${ref}`;
/** The server's memo of a reference (src/server/option-reference.ts; e2e-server.test.ts checks they agree). */
export const OPTION_REFERENCE_MEMO = `option-reference-v${OPTION_REFERENCE_FORMAT}`;

/** Each game's addon source as the e2e server has it (e2eServerEnv's folders and recorded answers). */
const SOURCES: Record<AddonGameId, () => AddonSourceCache> = {
  forever: testForeverAddonSource,
  tbc: () => weakAuras2AddonSource(testWeakAuras2Cache()),
};

/** Where the e2e server keeps each game's reference for its default (newest) addon version, and that version's ref. */
export async function e2eOptionReferenceFiles(): Promise<{ game: AddonGameId; file: string; ref: string }[]> {
  return Promise.all(
    (Object.keys(SOURCES) as AddonGameId[]).map(async (game) => {
      const source = SOURCES[game]();
      // As the server picks it (resolveServerRef): the newest release, else the game's fallback.
      const resolution = await source.resolve((await source.versions()).defaultRef ?? findGame(game)!.addon.fallbackRef);
      return { game, file: source.memoFile(resolution, OPTION_REFERENCE_MEMO), ref: resolution.ref };
    }),
  );
}

/** References the server is to generate in this run: its file → the generated cache's file to keep it in. */
const pendingFile = (port: number) => path.join(e2eDataDir(port), "option-references-pending.json");

/** Before the tests: the server keeps the generated cache's reference, or none (it generates one). */
export async function seedOptionReferences(port: number): Promise<void> {
  const pending: Record<string, string> = {};
  for (const { game, file, ref } of await e2eOptionReferenceFiles()) {
    const cached = await readGenerated(cacheKey(game, ref), GENERATOR);
    if (cached === undefined) {
      await rm(file, { force: true });
      pending[file] = generatedFile(cacheKey(game, ref), GENERATOR);
      continue;
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(cached));
  }
  await mkdir(e2eDataDir(port), { recursive: true });
  await writeFile(pendingFile(port), JSON.stringify(pending));
}

/** After the tests: a reference the server generated goes into the generated cache. */
export async function keepOptionReferences(port: number): Promise<void> {
  let pending: Record<string, string>;
  try {
    pending = JSON.parse(await readFile(pendingFile(port), "utf8")) as Record<string, string>;
  } catch {
    return;
  }
  for (const [file, cacheFile] of Object.entries(pending)) {
    if (!existsSync(file)) continue;
    await mkdir(path.dirname(cacheFile), { recursive: true });
    const tmp = `${cacheFile}.${process.pid}.tmp`;
    await writeFile(tmp, await readFile(file));
    await rename(tmp, cacheFile);
  }
  await rm(pendingFile(port), { force: true });
}
