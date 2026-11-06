import type { NextRequest } from "next/server";
import { addonBundleResponse } from "@/server/addon/http";

/**
 * GET /api/addon/<ref>/bundle?set=light|full[&format=json|gzip]: every addon file a loader needs as one
 * JSON `{ ref, set, files: { path: source } }`. "light" is what encode/decode reads; "full" adds the full
 * addon VM's files. `format=gzip` returns the same JSON pre-gzipped (application/gzip).
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/addon/[ref]/bundle">) {
  const { ref } = await ctx.params;
  const params = request.nextUrl.searchParams;
  return addonBundleResponse(request, decodeURIComponent(ref), params.get("set"), params.get("format"));
}
