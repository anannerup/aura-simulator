import { connection, type NextRequest } from "next/server";
import { buildPageUrl } from "@/workspace";
import { requestOrigin } from "@/server/request-origin";
import { getWorkspaceHub, rejectWorkspaceId } from "@/server/workspaces";

/**
 * GET /api/workspaces/<id>: the latest push to the workspace (`code: null` when there is none yet), with
 * `revision`, `updatedAt`, `source` and the page `url` (`?w=`). `?revision=<n>` gives that recent revision
 * instead (404 when it is no longer kept); pages use it to fetch each change the event stream announces.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/workspaces/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const rejected = rejectWorkspaceId(id);
  if (rejected) return rejected;
  const url = buildPageUrl(requestOrigin(request.headers), id);
  const headers = { "Cache-Control": "no-store" };
  const wanted = request.nextUrl.searchParams.get("revision");
  if (wanted !== null) {
    const revision = Number(wanted);
    const snap = Number.isInteger(revision) && revision > 0 ? getWorkspaceHub().get(id, revision) : null;
    if (!snap) return Response.json({ error: `Revision ${wanted} of ${id} is not kept` }, { status: 404, headers });
    return Response.json({ ...snap, url }, { headers });
  }
  return Response.json({ ...getWorkspaceHub().get(id), url }, { headers });
}
