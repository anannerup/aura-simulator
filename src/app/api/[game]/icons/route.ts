import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { parseIdList } from "@/server/id-list";

const MAX_IDS = 200;

/**
 * GET /api/<game>/icons?files=<FileDataID,...>&spells=<spell ID,...> (up to 200 each)
 * → `{files: {"135932": "spell_holy_magicalsentry" | null}, spells: {"1459": ... | null}}`.
 * Icon names are lower case without extension. No network.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/icons">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  const params = request.nextUrl.searchParams;
  const files = parseIdList(params.get("files"), MAX_IDS);
  const spells = parseIdList(params.get("spells"), MAX_IDS);
  if (!files || !spells) {
    return Response.json(
      { error: `files and spells must be comma-separated positive integers (at most ${MAX_IDS} each)` },
      { status: 400 },
    );
  }
  return Response.json(server.spells.icons({ files, spells }));
}
