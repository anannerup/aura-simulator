import type { AddonGameId } from "@/core";

/**
 * A game the app builds auras for: an addon (its versions, where its source comes from) plus a game client (client
 * profile, client data, spell database), with its own rules, docs and examples. Each game is its own site
 * (`/<id>`, `/api/<id>/...`) with its own workspaces. This is the page-safe part; the server's part is `ServerGame`
 * (`src/server/game.ts`). What the full addon VM loads for the game (client profile, contract, extractors) is the
 * aura core's, by the same id (`src/core/addon-vm/games.ts`).
 */
export interface Game {
  /** The URL segment, storage namespace and the aura core's game: "forever". */
  id: AddonGameId;
  /** What the player calls the game: "WoW Forever". */
  name: string;
  addon: {
    /** The addon players run: "Musca Auras". */
    name: string;
    /** The release the app uses when the version list can't be read. */
    fallbackRef: string;
  };
}

/** A game the picker announces before the app supports it. */
export interface UpcomingGame {
  id: string;
  name: string;
  addonName: string;
}
