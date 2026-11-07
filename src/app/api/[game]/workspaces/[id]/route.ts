import { connection, type NextRequest } from "next/server";
import { buildPageUrl } from "@/workspace";
import { routeGame } from "@/games/server";
import { requestOrigin } from "@/server/request-origin";
import { getWorkspaceHub, rejectWorkspaceId } from "@/server/workspaces";

/**
 * GET /api/<game>/workspaces/<id>: the latest push to the game's workspace (`code: null` when there is none yet), with
 * `revision`, `updatedAt`, `source` and the page `url` (`/<game>?w=`). `?revision=<n>` gives that recent revision
 * instead (404 when it is no longer kept); pages use it to fetch each change the event stream announces.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/workspaces/[id]">) {
  await connection();
  const { game, id } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const rejected = rejectWorkspaceId(id);
  if (rejected) return rejected;
  const hub = getWorkspaceHub(server.game.id);
  const url = buildPageUrl(requestOrigin(request.headers), server.game.id, id);
  const headers = { "Cache-Control": "no-store" };
  const wanted = request.nextUrl.searchParams.get("revision");
  if (wanted !== null) {
    const revision = Number(wanted);
    const snap = Number.isInteger(revision) && revision > 0 ? hub.get(id, revision) : null;
    if (!snap) return Response.json({ error: `Revision ${wanted} of ${id} is not kept` }, { status: 404, headers });
    return Response.json({ ...snap, url }, { headers });
  }
  return Response.json({ ...hub.get(id), url }, { headers });
}

/**
 * DELETE /api/<game>/workspaces/<id>: forgets the workspace on the server, its pushes and its situation →
 * `{workspace, deleted}` (`deleted: false` when nothing was kept for it). Pages that have it open keep their copy
 * (workspaces live in the browser); a later push starts it again.
 */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/[game]/workspaces/[id]">) {
  const { game, id } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const rejected = rejectWorkspaceId(id);
  if (rejected) return rejected;
  return Response.json({ workspace: id, deleted: getWorkspaceHub(server.game.id).delete(id) });
}
