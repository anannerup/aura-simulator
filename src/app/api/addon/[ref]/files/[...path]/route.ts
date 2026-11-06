import { connection } from "next/server";
import { addonFileResponse } from "@/server/addon/http";

/** GET /api/addon/<ref>/files/WeakAuras/Init.lua: path-style alias of /api/addon/<ref>/file?path=. */
export async function GET(_request: Request, ctx: RouteContext<"/api/addon/[ref]/files/[...path]">) {
  await connection();
  const { ref, path } = await ctx.params;
  return addonFileResponse(decodeURIComponent(ref), path.map(decodeURIComponent).join("/"));
}
