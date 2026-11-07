import type { NextRequest } from "next/server";
import { diffAddonVersions, getAddonSourceCache } from "@/server/addon";
import { getServerAuraCore } from "@/server/addon/core";
import { errorResponse } from "@/server/addon/http";

/** GET /api/addon/diff?from=<ref>&to=<ref>: what changed in the options (and files, changelog) between two refs. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to) return Response.json({ error: "from and to are required" }, { status: 400 });
  try {
    const registriesOf = async ({ ref }: { ref: string }) => (await getServerAuraCore(ref)).registries();
    return Response.json(await diffAddonVersions(getAddonSourceCache(), registriesOf, from, to));
  } catch (e) {
    return errorResponse(e);
  }
}
