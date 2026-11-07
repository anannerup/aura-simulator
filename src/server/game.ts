/**
 * A game on the server: what the shared server code (addon routes, push, spells, docs) needs from it. Each game builds
 * its own in `src/games/<id>/server.ts`; `src/games/server.ts` finds one by id.
 */
import path from "node:path";
import type { Game } from "@/games/game";
import type { AddonSourceCache } from "./addon/source-cache";
import type { SpellCache } from "./spells";

export interface ServerGame {
  readonly game: Game;
  /** The addon's released versions and their files. */
  readonly addon: AddonSourceCache;
  /** The game client's spells and icon names. */
  readonly spells: SpellCache;
  /** The agent docs (Markdown) for an origin, generated from the requested addon version (default: the newest). */
  agentDocs(origin: string, requestedRef?: string | null): Promise<string>;
}

/** Where a game keeps its server data: `<DATA_DIR or <repo>/data>/<game>`. */
export function gameDataDir(gameId: string): string {
  return path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), gameId);
}

/** A game's addon source cache: `<ADDON_CACHE_DIR>/<game>` if set (tests share one), else `<data>/<game>/addon`. */
export function addonCacheDir(gameId: string): string {
  const shared = process.env.ADDON_CACHE_DIR;
  return shared ? path.join(shared, gameId) : path.join(gameDataDir(gameId), "addon");
}

/** Recorded upstream answers for a game's addon (tests), from ADDON_UPSTREAM_FIXTURES=<dir>: `<dir>/<game>/addon`. */
export function addonUpstreamFixtures(gameId: string): string | null {
  const dir = process.env.ADDON_UPSTREAM_FIXTURES;
  return dir ? path.resolve(dir, gameId, "addon") : null;
}
