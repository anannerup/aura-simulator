import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";

/**
 * GET /api/<game>/icons/search?q=<words of an icon name, or an Interface\Icons path>&limit=<1-100>
 * → `{query, build, limit, total, results: [{id, name, path, iconUrl}]}`: icons of the game's file list
 * (`Interface\Icons\`), best matches first. `id` is the FileDataID, `path` the `Interface\Icons\NAME` an aura can use.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/icons/search">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  const params = request.nextUrl.searchParams;
  const limitParam = params.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  if (limit !== undefined && !Number.isFinite(limit)) return Response.json({ error: "limit must be a number" }, { status: 400 });
  try {
    return Response.json(await server.files.searchIcons(params.get("q") ?? "", { limit }));
  } catch (err) {
    return Response.json({ error: `The game's file list couldn't be downloaded: ${errorMessage(err)}` }, { status: 502 });
  }
}
