import { connection } from "next/server";
import { routeGame } from "@/games/server";
import { errorResponse } from "@/server/addon/http";

/** GET /api/<game>/addon/versions: the addon's releases (newest first, real tag names) and the default release. */
export async function GET(_request: Request, ctx: RouteContext<"/api/[game]/addon/versions">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  try {
    return Response.json(await server.addon.versions());
  } catch (e) {
    return errorResponse(e);
  }
}
