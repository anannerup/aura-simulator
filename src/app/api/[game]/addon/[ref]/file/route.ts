import type { NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { addonFileResponse } from "@/server/addon/http";

/** GET /api/<game>/addon/<release>/file?path=WeakAuras/Init.lua: one addon file, from the server's cache. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/addon/[ref]/file">) {
  const { game, ref } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const file = request.nextUrl.searchParams.get("path");
  if (!file) return Response.json({ error: "path is required" }, { status: 400 });
  return addonFileResponse(server.addon, decodeURIComponent(ref), file);
}
