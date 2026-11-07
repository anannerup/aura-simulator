import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { resolveServerRef } from "@/server/addon/core";
import { texturePicture } from "@/server/texture-picture";

/**
 * GET /api/<game>/textures/picture.png?path=<a game path, a FileDataID or an addon path>: the texture as a PNG, to look
 * at (the similar-texture search's `pictureUrl`). Addon files come from the addon's default release. 400 no path,
 * 404 no such file, 502 it couldn't be downloaded or read.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/textures/picture.png">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  const texture = request.nextUrl.searchParams.get("path")?.trim();
  if (!texture) return Response.json({ error: "path is required: a game path, a FileDataID or an Interface\\AddOns\\ path" }, { status: 400 });
  try {
    const png = await texturePicture(
      {
        files: server.files,
        readAddonFile: async (file) => {
          const { ref } = await resolveServerRef(server);
          return (await server.addon.readFile(ref, file)).bytes;
        },
      },
      texture,
    );
    if (!png) return Response.json({ error: `The game has no texture ${texture}` }, { status: 404 });
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
  } catch (err) {
    return Response.json({ error: `The texture couldn't be downloaded or read: ${errorMessage(err)}` }, { status: 502 });
  }
}
