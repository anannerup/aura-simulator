import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { parseIdList } from "@/server/id-list";
import { errorMessage } from "@/lib/errors";

const MAX = 200;

/**
 * GET /api/<game>/files?path=<game path>&path=…&ids=<FileDataID,…> (up to 200 of each)
 * → `{build, paths: {"Interface\\Cursor\\Cast": {id: 131015, path: "Interface\\CURSOR\\Cast.blp"} | null}, ids: {…}}`.
 * Paths are matched as the game does: any case, `/` or `\`, with or without `.blp`/`.tga`. The game's file list
 * (every `Interface\` file) is downloaded from wago.tools on first use.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/files">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  const params = request.nextUrl.searchParams;
  const paths = params.getAll("path").filter((p) => p.trim() !== "");
  const ids = parseIdList(params.get("ids"), MAX);
  if (!ids || paths.length > MAX) {
    return Response.json({ error: `Give up to ${MAX} path= parameters and ids= as comma-separated FileDataIDs (at most ${MAX})` }, { status: 400 });
  }
  try {
    return Response.json(await server.files.lookup({ paths, ids }));
  } catch (err) {
    return Response.json({ error: `The game's file list couldn't be downloaded: ${errorMessage(err)}` }, { status: 502 });
  }
}
