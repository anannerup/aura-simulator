import { connection, type NextRequest } from "next/server";
import { isWorkspaceId } from "@/workspace";
import { getWorkspaceHub, pageUrlFor } from "@/server/workspaces";

/** GET /api/workspaces/<id>: the workspace's current state code (`code: null` when it has none yet). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/workspaces/[id]">) {
  await connection();
  const { id } = await ctx.params;
  if (!isWorkspaceId(id)) return Response.json({ error: "Workspace IDs are 1-64 of A-Z a-z 0-9 _ -" }, { status: 400 });
  const snap = getWorkspaceHub().get(id);
  return Response.json({ ...snap, url: pageUrlFor(request.nextUrl.origin, id, snap.code) });
}
