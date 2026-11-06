import { connection } from "next/server";
import { isShortId } from "@/workspace";
import { getShortLinks } from "@/server/workspaces";

/** GET /api/short-links/<id> → `{id, code}`; 404 for an unknown ID. */
export async function GET(_request: Request, ctx: RouteContext<"/api/short-links/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const code = isShortId(id) ? getShortLinks().get(id) : null;
  if (!code) return Response.json({ error: `No short link ${id}` }, { status: 404 });
  return Response.json({ id, code });
}
