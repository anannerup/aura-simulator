import type { NextRequest } from "next/server";
import { isWorkspaceId } from "@/workspace";
import { parsePushBody, PushError, pushToWorkspace, readBodyText } from "@/server/workspaces";

/** Header a page sends with its own pushes (`CLIENT_HEADER` in src/app/workspace/session.ts). */
const CLIENT_HEADER = "x-aura-client";

/**
 * POST /api/workspaces/<id>/aura with `{code}`, `{aura, children?}` or a bare state code (up to 32 MB):
 * validates it with the addon, makes it the workspace's state, notifies open pages.
 * Answers `{workspace, code, url, updatedAt, revision, validation}` (`url`: the `?w=` page; `?validate=false`
 * leaves `validation` null; `?ref=` picks the addon version, default the newest release); 400/413/422 `{error}` on bad input.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/workspaces/[id]/aura">) {
  const { id } = await ctx.params;
  if (!isWorkspaceId(id)) return Response.json({ error: "Workspace IDs are 1-64 of A-Z a-z 0-9 _ -" }, { status: 400 });
  try {
    const input = parsePushBody(await readBodyText(request), request.headers.get("content-type"));
    const source = request.headers.get(CLIENT_HEADER)?.slice(0, 64) || null;
    const params = request.nextUrl.searchParams;
    const validate = params.get("validate") !== "false";
    return Response.json(await pushToWorkspace(id, input, request.nextUrl.origin, { source, validate, ref: params.get("ref") }));
  } catch (e) {
    if (e instanceof PushError) return Response.json({ error: e.message }, { status: e.status });
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `Could not load the aura core: ${message}` }, { status: 503 });
  }
}
