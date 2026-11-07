import { routeGame } from "@/games/server";

/** POST /api/<game>/spells/sync, optional JSON body {"build": "1.60.1.70790"} (default: the game's latest build). */
export async function POST(request: Request, ctx: RouteContext<"/api/[game]/spells/sync">) {
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  let build: string | undefined;
  const text = await request.text();
  if (text.trim() !== "") {
    try {
      const body = JSON.parse(text) as { build?: unknown };
      if (body.build !== undefined && typeof body.build !== "string") throw new Error("bad build");
      build = body.build as string | undefined;
    } catch {
      return Response.json({ error: 'Body must be empty or JSON like {"build": "1.60.1.70790"}' }, { status: 400 });
    }
  }
  try {
    return Response.json(await server.spells.sync({ build }));
  } catch (err) {
    return Response.json({ error: `Sync failed: ${(err as Error).message}` }, { status: 502 });
  }
}
