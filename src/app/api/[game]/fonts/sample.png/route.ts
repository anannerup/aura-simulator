import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { captureFontSample, RenderPageError, ScreenshotUnavailable } from "@/server/screenshot";
import { buildFontSampleUrl, readFontSampleOptions, RenderOptionsError } from "@/workspace";

/**
 * GET /api/<game>/fonts/sample.png?font=<name>[&text=&size=&outline=&shadowX=&shadowY=&colour=&scale=&background=&ref=]:
 * a PNG of one font drawing a text as the game screen draws a text (the page `/<game>/fonts/sample`, taken in a
 * headless browser), for comparing with a screenshot's text without a browser. `size` is the font size in UI units,
 * `scale` game pixels per unit (as the screenshot endpoint's); `outline` the font flags (default OUTLINE). 400 bad
 * options, 503 no browser here.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/fonts/sample.png">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  try {
    const options = readFontSampleOptions(request.nextUrl.searchParams);
    // The page as this server itself serves it (its listen address, not the client's origin through a proxy).
    const png = await captureFontSample(buildFontSampleUrl(request.nextUrl.origin, server.game.id, options));
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof RenderOptionsError || err instanceof RenderPageError) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof ScreenshotUnavailable) return Response.json({ error: err.message }, { status: 503 });
    return Response.json({ error: `The sample couldn't be drawn: ${errorMessage(err)}` }, { status: 500 });
  }
}
