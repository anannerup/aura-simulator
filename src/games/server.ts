/** The games on the server, by id (server only). */
import type { ServerGame } from "@/server/game";
import { foreverServer } from "./forever/server";
import { tbcServer } from "./tbc/server";

const SERVER_GAMES: Record<string, ServerGame> = { forever: foreverServer, tbc: tbcServer };

export function findServerGame(id: string): ServerGame | undefined {
  return Object.hasOwn(SERVER_GAMES, id) ? SERVER_GAMES[id] : undefined;
}

/** A route's `[game]`: the game, or the 404 answer for an id that isn't one. */
export function routeGame(id: string): ServerGame | Response {
  return findServerGame(id) ?? Response.json({ error: `No game called "${id}"` }, { status: 404 });
}
