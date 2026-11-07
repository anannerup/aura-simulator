import type { NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { addonBundleResponse } from "@/server/addon/http";

/**
 * GET /api/<game>/addon/<release>/bundle?set=light|full[&format=json|gzip]: every addon file a loader needs as one
 * JSON `{ ref, set, files: { path: source } }`. "light" is what encode/decode reads; "full" adds the full
 * addon VM's files. `format=gzip` returns the same JSON pre-gzipped (application/gzip).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/addon/[ref]/bundle">) {
  const { game, ref } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const params = request.nextUrl.searchParams;
  return addonBundleResponse(server.addon, request, decodeURIComponent(ref), params.get("set"), params.get("format"), server.game.id);
}
