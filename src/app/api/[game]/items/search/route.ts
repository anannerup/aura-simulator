import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";

/**
 * GET /api/<game>/items/search?q=<name or ID>&limit=<1-100> → `{query, build, limit, total, results: Item[]}`, best
 * matches first. The game's item tables are downloaded from wago.tools on first use.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/items/search">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  const params = request.nextUrl.searchParams;
  const limitParam = params.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  if (limit !== undefined && !Number.isFinite(limit)) return Response.json({ error: "limit must be a number" }, { status: 400 });
  try {
    return Response.json(await server.items.search(params.get("q") ?? "", { limit }));
  } catch (err) {
    return Response.json({ error: `The game's items couldn't be downloaded: ${errorMessage(err)}` }, { status: 502 });
  }
}
