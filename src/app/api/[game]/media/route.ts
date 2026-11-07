import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { loadGameMedia } from "@/server/media";
import { requestOrigin } from "@/server/request-origin";

/**
 * GET /api/<game>/media[?ref=<addon version>]: LibSharedMedia's fonts, bar textures, borders, backgrounds and sounds
 * of a stock client with the game's addon (the game's own and the addon's registrations), with each type's default
 * and the font sample page (`MediaLists`).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/media">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  try {
    return Response.json(await loadGameMedia(server, requestOrigin(request.headers), request.nextUrl.searchParams.get("ref")));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 503 });
  }
}
