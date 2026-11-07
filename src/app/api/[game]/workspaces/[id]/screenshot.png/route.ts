import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { captureRenderPage, RenderPageError, ScreenshotUnavailable } from "@/server/screenshot";
import { PushError, rejectWorkspaceId, renderScene } from "@/server/workspaces";
import { buildRenderUrl, readRenderOptions, RenderOptionsError } from "@/workspace";

/**
 * GET /api/<game>/workspaces/<id>/screenshot.png[?aura=&scale=&padding=&background=&situation=&ref=]: a PNG of the
 * aura as the game draws it, cropped to its bounds (the render page `/<game>/render`, taken in a headless browser).
 * `aura`: an aura or group id from the workspace's recent pushes (default: the latest push); `scale`: game pixels per
 * UI unit (default 1); `padding`: UI units around it; `background`: a hex colour (default transparent); `situation`:
 * a situation as JSON (default: the workspace's). 400 bad options, 404 nothing to draw, 503 no browser here.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/workspaces/[id]/screenshot.png">) {
  await connection();
  const { game, id } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const rejected = rejectWorkspaceId(id);
  if (rejected) return rejected;
  try {
    const options = readRenderOptions(request.nextUrl.searchParams);
    // Answers what can't be drawn (no push, no such aura, a bad situation) before a browser is started.
    const scene = await renderScene(server, id, options);
    // The page as this server itself serves it (its listen address, not the client's origin through a proxy), at the
    // push just checked and the aura it found.
    const url = buildRenderUrl(request.nextUrl.origin, server.game.id, id, { ...options, aura: scene.auraId });
    const png = await captureRenderPage(url);
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Aura-Revision": String(scene.revision) },
    });
  } catch (e) {
    if (e instanceof RenderOptionsError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof PushError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof RenderPageError) return Response.json({ error: e.message }, { status: 422 });
    if (e instanceof ScreenshotUnavailable) return Response.json({ error: e.message }, { status: 503 });
    return Response.json({ error: `Could not take the screenshot: ${errorMessage(e)}` }, { status: 500 });
  }
}
