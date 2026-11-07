import type { NextRequest } from "next/server";
import { CLIENT_HEADER } from "@/workspace";
import { requestOrigin } from "@/server/request-origin";
import { parsePushBody, PushError, pushToWorkspace, readBodyText, rejectWorkspaceId } from "@/server/workspaces";
import { errorMessage } from "@/lib/errors";

/**
 * POST /api/workspaces/<id>/aura with `{code}`, `{aura, children?}` or a bare state code (up to 32 MB):
 * validates it with the addon, records it as the workspace's latest push, notifies open pages.
 * Answers `{workspace, code, url, updatedAt, revision, validation}` (`url`: the `?w=` page; `?validate=false`
 * leaves `validation` null; `?ref=` picks the addon version, default the newest release); 400/413/422 `{error}` on bad input.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/workspaces/[id]/aura">) {
  const { id } = await ctx.params;
  const rejected = rejectWorkspaceId(id);
  if (rejected) return rejected;
  try {
    const input = parsePushBody(await readBodyText(request), request.headers.get("content-type"));
    const source = request.headers.get(CLIENT_HEADER)?.slice(0, 64) || null;
    const params = request.nextUrl.searchParams;
    const validate = params.get("validate") !== "false";
    return Response.json(await pushToWorkspace(id, input, requestOrigin(request.headers), { source, validate, ref: params.get("ref") }));
  } catch (e) {
    if (e instanceof PushError) return Response.json({ error: e.message }, { status: e.status });
    const message = errorMessage(e);
    return Response.json({ error: `Could not load the aura core: ${message}` }, { status: 503 });
  }
}
