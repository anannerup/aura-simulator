import type { NextRequest } from "next/server";
import { getAddonSourceCache } from "@/server/addon";
import { errorResponse } from "@/server/addon/http";

/** GET /api/addon/resolve?ref=<release, branch or commit>: what the ref is and the immutable ref it stands for. */
export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("ref");
  if (!ref) return Response.json({ error: "ref is required" }, { status: 400 });
  try {
    return Response.json(await getAddonSourceCache().resolve(ref));
  } catch (e) {
    return errorResponse(e);
  }
}
