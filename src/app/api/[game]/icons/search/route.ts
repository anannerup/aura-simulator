import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { parseSearchPage } from "@/server/name-search";

/**
 * GET /api/<game>/icons/search?q=<words of an icon name, or an Interface\Icons path>&offset=<0…>&limit=<1-100>
 * → `{query, build, offset, limit, total, results: [{id, name, path, iconUrl}]}`: icons of the game's file list
 * (`Interface\Icons\`), best matches first, one page of them. `id` is the FileDataID, `path` the
 * `Interface\Icons\NAME` an aura can use.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/icons/search">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  const params = request.nextUrl.searchParams;
  const page = parseSearchPage(params);
  if ("error" in page) return Response.json(page, { status: 400 });
  try {
    return Response.json(await server.files.searchIcons(params.get("q") ?? "", page));
  } catch (err) {
    return Response.json({ error: `The game's file list couldn't be downloaded: ${errorMessage(err)}` }, { status: 502 });
  }
}
