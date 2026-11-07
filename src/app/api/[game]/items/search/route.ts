import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { UnknownIconError } from "@/server/items";
import { parseSearchPage } from "@/server/name-search";

/**
 * GET /api/<game>/items/search?q=<name or ID>&icon=<FileDataID, Interface\Icons path or icon name>&offset=<0…>&limit=<1-100>
 * → `{query, icon, build, offset, limit, total, results: Item[]}`, best matches first, one page of them. `icon` keeps
 * the items with that icon (alone: all of them; `icon` in the answer is the icon it named); 404 when the game has no
 * such icon. The game's item tables are downloaded from wago.tools on first use.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/items/search">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  const params = request.nextUrl.searchParams;
  const page = parseSearchPage(params);
  if ("error" in page) return Response.json(page, { status: 400 });
  try {
    return Response.json(await server.items.search(params.get("q") ?? "", { ...page, icon: params.get("icon") ?? undefined }));
  } catch (err) {
    if (err instanceof UnknownIconError) return Response.json({ error: err.message }, { status: 404 });
    return Response.json({ error: `The game's items couldn't be downloaded: ${errorMessage(err)}` }, { status: 502 });
  }
}
