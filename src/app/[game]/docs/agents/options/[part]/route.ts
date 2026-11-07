import { connection } from "next/server";
import { optionReferencePartMarkdown } from "@/games/docs/option-reference";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { loadOptionReference } from "@/server/option-reference";
import { requestOrigin } from "@/server/request-origin";

/**
 * GET /<game>/docs/agents/options/<part>.md[?ref=<addon version>]: one part of the option ↔ table reference
 * (`optionReferenceParts`: `keys`, a tab, `region-<display type>`, `trigger`, `trigger-<trigger type>`,
 * `conditions-trigger-<trigger type>`, `conditions-display-<display type>`), listed in
 * its index /<game>/docs/agents/options.md. 404 for a part that isn't one.
 */
export async function GET(request: Request, ctx: RouteContext<"/[game]/docs/agents/options/[part]">) {
  await connection();
  const { game, part } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const name = part.endsWith(".md") ? part.slice(0, -3) : null;
  if (!name) return new Response("Parts end in .md: see the index, options.md\n", { status: 404 });
  try {
    const reference = await loadOptionReference(server, new URL(request.url).searchParams.get("ref"));
    const md = optionReferencePartMarkdown(requestOrigin(request.headers), server.game.id, server.game.addon.name, reference, name);
    if (md === null) return new Response(`No part "${name}" in the option reference: see its index, options.md\n`, { status: 404 });
    return new Response(md, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  } catch (e) {
    return new Response(`The option reference could not be generated: ${errorMessage(e)}\n`, { status: 503 });
  }
}
