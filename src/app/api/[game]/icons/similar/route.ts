import { connection, type NextRequest } from "next/server";
import type { IconColourMode } from "@/api/files";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { BadUploadError, decodeUpload, MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "@/server/icon-index";
import { parseSearchPage } from "@/server/name-search";

const MODES: readonly IconColourMode[] = ["auto", "colour", "grey"];

/**
 * POST /api/<game>/icons/similar?q=<words of an icon name>&colour=auto|colour|grey&offset=<0…>&limit=<1-100>
 * with a picture of an icon (a crop of a screenshot; PNG, JPEG or WebP, up to 8 MB) as the body
 * (`Content-Type: image/png|image/jpeg|image/webp`) or as the form field `image` (`multipart/form-data`).
 *
 * 200 → `IconSimilarResult`: icons ranked by how alike they look, best (lowest `distance`) first, one page of them,
 * each with the WeakAuras `zoom` it matched best at. `q` compares only icons whose names match (as icon search
 * does); without it every icon of the game is compared, which needs the whole icon index: until it is built, 202 →
 * `IconIndexProgress` (`indexed`, `total`, `retryAfter`, `hint`), and building starts in the background. 202 too when
 * `q` matches more not-yet-indexed icons than one search fetches. 400 bad parameters or picture, 413 too large,
 * 415 another body type, 502 the game's file list couldn't be downloaded.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/[game]/icons/similar">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  const params = request.nextUrl.searchParams;
  const page = parseSearchPage(params);
  if ("error" in page) return Response.json(page, { status: 400 });
  const colour = (params.get("colour") ?? "auto") as IconColourMode;
  if (!MODES.includes(colour)) return Response.json({ error: `colour must be one of ${MODES.join(", ")}` }, { status: 400 });

  const body = await readUpload(request);
  if (body instanceof Response) return body;
  let upload;
  try {
    upload = await decodeUpload(body);
  } catch (err) {
    if (err instanceof BadUploadError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }

  try {
    const result = await server.iconIndex.similar(upload, { ...page, q: params.get("q"), colour });
    if (result.status === "indexing") {
      return Response.json(result, { status: 202, headers: { "Retry-After": String(result.retryAfter) } });
    }
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: `The game's file list couldn't be downloaded: ${errorMessage(err)}` }, { status: 502 });
  }
}

const tooLarge = () => Response.json({ error: `The picture is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` }, { status: 413 });

/** The uploaded picture's bytes: the raw body with an image type, or the multipart form field `image`. */
async function readUpload(request: NextRequest): Promise<Uint8Array | Response> {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) return tooLarge();
  let bytes: Uint8Array;
  if (type === "multipart/form-data") {
    let image: FormDataEntryValue | null;
    try {
      image = (await request.formData()).get("image");
    } catch (err) {
      return Response.json({ error: `The form couldn't be read: ${errorMessage(err)}` }, { status: 400 });
    }
    if (!(image instanceof Blob)) return Response.json({ error: "The form has no file field `image`" }, { status: 400 });
    bytes = new Uint8Array(await image.arrayBuffer());
  } else if ((UPLOAD_TYPES as readonly string[]).includes(type)) {
    bytes = new Uint8Array(await request.arrayBuffer());
  } else {
    return Response.json(
      { error: `Send the picture as the body with Content-Type ${UPLOAD_TYPES.join(", ")}, or as the multipart/form-data field \`image\`` },
      { status: 415 },
    );
  }
  if (bytes.byteLength === 0) return Response.json({ error: "The picture is empty" }, { status: 400 });
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return tooLarge();
  return bytes;
}
