import type { NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { diffAddonVersions } from "@/server/addon";
import { getServerAuraCore } from "@/server/addon/core";
import { errorResponse } from "@/server/addon/http";

/** GET /api/<game>/addon/diff?from=<release>&to=<release>: what changed in the options (and files, changelog) between two releases. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/addon/diff">) {
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  const params = request.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to) return Response.json({ error: "from and to are required" }, { status: 400 });
  try {
    const registriesOf = async ({ ref }: { ref: string }) => (await getServerAuraCore(server, ref)).registries();
    return Response.json(await diffAddonVersions(server.addon, registriesOf, from, to));
  } catch (e) {
    return errorResponse(e);
  }
}
