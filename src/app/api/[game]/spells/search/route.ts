import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";

/** GET /api/<game>/spells/search?q=<name or ID>&limit=<1-100> */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/spells/search">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  const params = request.nextUrl.searchParams;
  const q = params.get("q") ?? "";
  const limitParam = params.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  if (limit !== undefined && !Number.isFinite(limit)) {
    return Response.json({ error: "limit must be a number" }, { status: 400 });
  }
  return Response.json(server.spells.search(q, { limit }));
}
