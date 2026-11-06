import type { NextRequest } from "next/server";
import { isWorkspaceId } from "@/workspace";
import { parsePushBody, PushError, pushToWorkspace } from "@/server/workspaces";

/**
 * POST /api/workspaces/<id>/aura with `{code}`, `{aura, children?}` or a bare state code:
 * validates it with the addon, makes it the workspace's state, updates open pages.
 * Answers `{workspace, code, url, updatedAt, revision}`; 400/413/422 `{error}` on bad input.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/workspaces/[id]/aura">) {
  const { id } = await ctx.params;
  if (!isWorkspaceId(id)) return Response.json({ error: "Workspace IDs are 1-64 of A-Z a-z 0-9 _ -" }, { status: 400 });
  try {
    const input = parsePushBody(await request.text(), request.headers.get("content-type"));
    return Response.json(await pushToWorkspace(id, input, request.nextUrl.origin));
  } catch (e) {
    if (e instanceof PushError) return Response.json({ error: e.message }, { status: e.status });
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `Could not load the aura core: ${message}` }, { status: 503 });
  }
}
