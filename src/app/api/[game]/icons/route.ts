import { connection, type NextRequest } from "next/server";
import { iconNameOfPath } from "@/api/files";
import { routeGame } from "@/games/server";
import { parseIdList } from "@/server/id-list";

const MAX_IDS = 200;

/**
 * GET /api/<game>/icons?files=<FileDataID,...>&spells=<spell ID,...> (up to 200 each)
 * → `{files: {"135932": "spell_holy_magicalsentry" | null}, spells: {"1459": ... | null}}`.
 * Icon names are lower case without extension. Files are named by the game's file list (downloaded on first use; the
 * spell database's icon names answer when it can't be), spells by the spell database.
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
  const result = server.spells.icons({ files, spells });
  if (files.length) {
    try {
      const found = await server.files.lookup({ ids: files });
      for (const [id, file] of Object.entries(found.ids)) {
        const name = file ? iconNameOfPath(file.path) : null;
        if (name) result.files[id] = name;
      }
    } catch {
      // The file list couldn't be downloaded: the spell database's names stand.
    }
  }
  return Response.json(result);
}
