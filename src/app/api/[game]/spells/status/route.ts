import { connection } from "next/server";
import { routeGame } from "@/games/server";

/** GET /api/<game>/spells/status: synced build, spell counts, Wowhead cache counts. */
export async function GET(_request: Request, ctx: RouteContext<"/api/[game]/spells/status">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  return Response.json(server.spells.status());
}
