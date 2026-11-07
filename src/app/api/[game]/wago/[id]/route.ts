import { connection } from "next/server";
import { routeGame } from "@/games/server";
import { fetchWagoCode, WagoFetchError } from "@/server/wago";
import { errorMessage } from "@/lib/errors";

/**
 * GET /api/<game>/wago/<id>: the import string of the wago.io aura `<id>` (its latest version), fetched from wago's
 * data API: `{id, code}`. 400 for an id that isn't one, 404 when wago has no such aura, 502 when wago fails.
 * The page imports the code like a pasted one, so the game's addon decides whether it takes it.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/[game]/wago/[id]">) {
  await connection();
  const { game, id } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const headers = { "Cache-Control": "no-store" };
  try {
    return Response.json({ id, code: await fetchWagoCode(id) }, { headers });
  } catch (e) {
    const status = e instanceof WagoFetchError ? e.status : 502;
    return Response.json({ error: errorMessage(e) }, { status, headers });
  }
}
