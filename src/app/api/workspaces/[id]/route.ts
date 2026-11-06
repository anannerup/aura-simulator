import { connection, type NextRequest } from "next/server";
import { isWorkspaceId } from "@/workspace";
import { getWorkspaceHub, pageUrlFor } from "@/server/workspaces";

/**
 * GET /api/workspaces/<id>: the workspace's current state code (`code: null` when it has none yet), with
 * `revision`, `updatedAt`, `source` and the page `url` (`?w=`). `?revision=<n>` gives that recent revision
 * instead (404 when it is no longer kept); pages use it to fetch each change the event stream announces.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/workspaces/[id]">) {
  await connection();
  const { id } = await ctx.params;
  if (!isWorkspaceId(id)) return Response.json({ error: "Workspace IDs are 1-64 of A-Z a-z 0-9 _ -" }, { status: 400 });
  const url = pageUrlFor(request.nextUrl.origin, id);
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
