import { connection } from "next/server";
import { isShortId, parseBundle } from "@/workspace";
import { getShortLinks } from "@/server/workspaces";

/**
 * GET /api/short-links/<id> → `{id, code, codes}`: `codes` holds every top-level item's state code (one for a
 * single aura or group), `code` the first. 404 for an unknown ID.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/short-links/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const text = isShortId(id) ? getShortLinks().get(id) : null;
  if (!text) return Response.json({ error: `No short link ${id}` }, { status: 404 });
  const codes = parseBundle(text) ?? [text];
  return Response.json({ id, code: codes[0], codes });
}
