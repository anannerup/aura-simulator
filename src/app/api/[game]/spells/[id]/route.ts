import { connection } from "next/server";
import { routeGame } from "@/games/server";

/** GET /api/<game>/spells/<id>: spell info with flags; 404 (same body) when no source knows the ID. */
export async function GET(_request: Request, ctx: RouteContext<"/api/[game]/spells/[id]">) {
  await connection();
  const { game, id: raw } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const id = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(id) || id <= 0) {
    return Response.json({ error: "Spell ID must be a positive integer" }, { status: 400 });
  }
  const spell = await server.spells.lookup(id);
  return Response.json(spell, { status: spell.found ? 200 : 404 });
}
