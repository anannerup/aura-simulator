/** The games of the picker at `/`. Per-game code lives in `src/games/<id>/`. */
import { forever } from "./forever";
import type { Game, UpcomingGame } from "./game";

export type { Game, UpcomingGame };

export const GAMES: readonly Game[] = [forever];

export const UPCOMING_GAMES: readonly UpcomingGame[] = [{ id: "tbc", name: "TBC Anniversary", addonName: "WeakAuras" }];

export function findGame(id: string): Game | undefined {
  return GAMES.find((g) => g.id === id);
}
