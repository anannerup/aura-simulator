import { connection } from "next/server";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";

/** GET /api/<game>/items/<id>: the item (name, quality, item level, icon, Wowhead link); 404 when the game has none. */
export async function GET(_request: Request, ctx: RouteContext<"/api/[game]/items/[id]">) {
  await connection();
  const { game, id: raw } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const id = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(id) || id <= 0) {
    return Response.json({ error: "Item ID must be a positive integer" }, { status: 400 });
  }
  try {
    const item = await server.items.lookup(id);
    return item ? Response.json(item) : Response.json({ error: `${server.game.name} has no item ${id}` }, { status: 404 });
  } catch (err) {
    return Response.json({ error: `The game's items couldn't be downloaded: ${errorMessage(err)}` }, { status: 502 });
  }
}
