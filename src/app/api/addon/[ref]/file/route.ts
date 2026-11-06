import type { NextRequest } from "next/server";
import { addonFileResponse } from "@/server/addon/http";

/** GET /api/addon/<ref>/file?path=WeakAuras/Init.lua: one addon file, from the server's cache. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/addon/[ref]/file">) {
  const { ref } = await ctx.params;
  const file = request.nextUrl.searchParams.get("path");
  if (!file) return Response.json({ error: "path is required" }, { status: 400 });
  return addonFileResponse(decodeURIComponent(ref), file);
}
