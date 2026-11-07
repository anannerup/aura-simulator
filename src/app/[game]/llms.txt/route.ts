import { connection } from "next/server";
import { routeGame } from "@/games/server";
import { requestOrigin } from "@/server/request-origin";

/** GET /<game>/llms.txt[?ref=<addon version>]: the game's agent docs as plain Markdown (same text as /<game>/docs/agents). */
export async function GET(request: Request, ctx: RouteContext<"/[game]/llms.txt">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  return new Response(await server.agentDocs(requestOrigin(request.headers), new URL(request.url).searchParams.get("ref")), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
