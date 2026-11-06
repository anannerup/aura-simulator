import type { NextRequest } from "next/server";
import { getSpellCache } from "@/server/spells";

/** GET /api/spells/search?q=<name or ID>&limit=<1-100> */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q") ?? "";
  const limitParam = params.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  if (limit !== undefined && !Number.isFinite(limit)) {
    return Response.json({ error: "limit must be a number" }, { status: 400 });
  }
  return Response.json(getSpellCache().search(q, { limit }));
}
