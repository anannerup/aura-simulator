import { connection } from "next/server";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { loadOptionReference } from "@/server/option-reference";

/**
 * GET /<game>/docs/agents/options.json[?ref=<addon version>]: the option ↔ table reference of the game's addon version
 * (default: the newest) as JSON (core's OptionReference). The first request for a version waits while it is
 * generated (a minute or two); after that it is cached.
 */
export async function GET(request: Request, ctx: RouteContext<"/[game]/docs/agents/options.json">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  try {
    return Response.json(await loadOptionReference(server, new URL(request.url).searchParams.get("ref")));
  } catch (e) {
    return Response.json({ error: errorMessage(e) }, { status: 503 });
  }
}
