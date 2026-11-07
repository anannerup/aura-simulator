import type { NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { errorResponse } from "@/server/addon/http";

/** GET /api/<game>/addon/resolve?ref=<release>: the release a ref names ("1.15.0" and "v1.15.0" both find v1.15.0). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/addon/resolve">) {
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  const ref = request.nextUrl.searchParams.get("ref");
  if (!ref) return Response.json({ error: "ref is required" }, { status: 400 });
  try {
    return Response.json(await server.addon.resolve(ref));
  } catch (e) {
    return errorResponse(e);
  }
}
