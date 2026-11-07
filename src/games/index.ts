/** The games of the picker at `/`. Per-game code lives in `src/games/<id>/`. */
import { forever } from "./forever";
import type { Game, UpcomingGame } from "./game";
import { tbc } from "./tbc";

export type { Game, UpcomingGame };

export const GAMES: readonly Game[] = [forever, tbc];

/** Games the picker shows as "coming soon" (none right now). */
export const UPCOMING_GAMES: readonly UpcomingGame[] = [];

export function findGame(id: string): Game | undefined {
  return GAMES.find((g) => g.id === id);
}
