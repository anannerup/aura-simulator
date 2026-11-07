import { connection } from "next/server";
import { optionReferenceMarkdown } from "@/games/option-reference-docs";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { loadOptionReference } from "@/server/option-reference";
import { requestOrigin } from "@/server/request-origin";

/**
 * GET /<game>/docs/agents/options.md[?ref=<addon version>]: the option ↔ table reference of the game's addon version
 * (default: the newest) as Markdown, both directions. The first request for a version waits while it is generated.
 */
export async function GET(request: Request, ctx: RouteContext<"/[game]/docs/agents/options.md">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  try {
    const reference = await loadOptionReference(server, new URL(request.url).searchParams.get("ref"));
    return new Response(optionReferenceMarkdown(requestOrigin(request.headers), server.game.id, server.game.addon.name, reference), {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  } catch (e) {
    return new Response(`The option reference could not be generated: ${errorMessage(e)}\n`, { status: 503 });
  }
}
