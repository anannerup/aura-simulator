import type { NextRequest } from "next/server";
import { CLIENT_HEADER, isWorkspaceId } from "@/workspace";
import { requestOrigin } from "@/server/request-origin";
import { parsePushBody, PushError, pushToWorkspace, readBodyText } from "@/server/workspaces";

/**
 * POST /api/workspaces/<id>/aura with `{code}`, `{aura, children?}` or a bare state code (up to 32 MB):
 * validates it with the addon, records it as the workspace's latest push, notifies open pages.
 * Answers `{workspace, code, url, updatedAt, revision, validation}` (`url`: the `?w=` page; `?validate=false`
 * leaves `validation` null); 400/413/422 `{error}` on bad input.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/workspaces/[id]/aura">) {
  const { id } = await ctx.params;
  if (!isWorkspaceId(id)) return Response.json({ error: "Workspace IDs are 1-64 of A-Z a-z 0-9 _ -" }, { status: 400 });
  try {
    const input = parsePushBody(await readBodyText(request), request.headers.get("content-type"));
    const source = request.headers.get(CLIENT_HEADER)?.slice(0, 64) || null;
    const validate = request.nextUrl.searchParams.get("validate") !== "false";
    return Response.json(await pushToWorkspace(id, input, requestOrigin(request.headers), { source, validate }));
  } catch (e) {
    if (e instanceof PushError) return Response.json({ error: e.message }, { status: e.status });
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `Could not load the aura core: ${message}` }, { status: 503 });
  }
}
