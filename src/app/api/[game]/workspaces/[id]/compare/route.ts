import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { CompareError, compareScreenshot, ImageError } from "@/server/compare";
import { RenderPageError, ScreenshotUnavailable } from "@/server/screenshot";
import { PushError, rejectWorkspaceId } from "@/server/workspaces";
import { MAX_RENDER_SCALE, readRenderOptions, RenderOptionsError } from "@/workspace";

/** Largest screenshot accepted (bytes). */
const MAX_UPLOAD = 16 * 1024 * 1024;

/** The uploaded picture: the raw body, or a multipart form's `screenshot` file (else its first file). */
async function upload(request: NextRequest): Promise<Uint8Array> {
  const type = request.headers.get("content-type") ?? "";
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD) throw new ImageError(`The screenshot is over ${MAX_UPLOAD / 1024 / 1024} MB: crop it to the aura`);
  if (type.startsWith("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("screenshot") ?? [...form.values()].find((v) => typeof v !== "string");
    if (!file || typeof file === "string") throw new ImageError("The form has no file: send the screenshot as the field `screenshot`");
    return new Uint8Array(await file.arrayBuffer());
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) throw new ImageError("No screenshot: send the image file as the request body (or a form's `screenshot` field)");
  if (bytes.length > MAX_UPLOAD) throw new ImageError(`The screenshot is over ${MAX_UPLOAD / 1024 / 1024} MB: crop it to the aura`);
  return bytes;
}

function positive(params: URLSearchParams, name: string, max: number): number | undefined {
  const raw = params.get(name);
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > max) throw new RenderOptionsError(`${name} must be a number above 0 up to ${max}, not "${raw}"`);
  return n;
}

/**
 * POST /api/<game>/workspaces/<id>/compare[?aura=&situation=&ref=&scale=&screenHeight=&image=comparison|picture]
 * with the player's screenshot (cropped around the aura) as the body (PNG, JPEG, WebP; or a multipart form's
 * `screenshot` file): draws the aura (the render page), finds the scale (game pixels per UI unit; `scale` fixes it)
 * and offset that lay it over the screenshot best, and answers JSON: the scale and other close ones, the offset, per
 * region the frame, what each draws around it, the difference, mean colours and text rows, the regions' pitch and
 * gaps, and `comparison` (a PNG as a data URL: screenshot | picture | difference). `image=comparison` (or `picture`)
 * answers that PNG instead. 400 bad options or upload, 404 nothing to draw, 422 nothing to compare, 503 no browser.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/[game]/workspaces/[id]/compare">) {
  await connection();
  const { game, id } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const rejected = rejectWorkspaceId(id);
  if (rejected) return rejected;
  try {
    const params = request.nextUrl.searchParams;
    const { aura, situation, ref } = readRenderOptions(params);
    const scale = positive(params, "scale", MAX_RENDER_SCALE);
    const screenHeight = positive(params, "screenHeight", 16384);
    const image = params.get("image");
    if (image !== null && image !== "comparison" && image !== "picture") throw new RenderOptionsError(`image must be "comparison" or "picture", not "${image}"`);
    const bytes = await upload(request);
    const result = await compareScreenshot(server, request.nextUrl.origin, id, { render: { aura, situation, ref }, scale, screenHeight }, bytes);
    const headers = { "Cache-Control": "no-store", "X-Aura-Revision": String(result.revision) };
    if (image === "comparison") return new Response(new Uint8Array(result.comparison.png), { headers: { ...headers, "Content-Type": "image/png" } });
    if (image === "picture") return new Response(new Uint8Array(result.picturePng), { headers: { ...headers, "Content-Type": "image/png" } });
    const { comparison, picturePng, ...rest } = result;
    void picturePng;
    return Response.json(
      { ...rest, comparison: { zoom: comparison.zoom, png: `data:image/png;base64,${comparison.png.toString("base64")}` } },
      { headers },
    );
  } catch (e) {
    if (e instanceof RenderOptionsError || e instanceof ImageError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof PushError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof CompareError || e instanceof RenderPageError) return Response.json({ error: e.message }, { status: 422 });
    if (e instanceof ScreenshotUnavailable) return Response.json({ error: e.message }, { status: 503 });
    return Response.json({ error: `Could not compare: ${errorMessage(e)}` }, { status: 500 });
  }
}
