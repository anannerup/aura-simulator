/** Decoding an uploaded picture (a crop of a player's screenshot) with sharp. Server only. */
import sharp from "sharp";
import type { RgbaImage } from "./features";

/** The image types an upload may be. */
export const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** The largest upload accepted, in bytes. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Uploads are shrunk to fit this many pixels per side before comparing (the comparison uses 8×8 cells). */
const MAX_SIDE = 128;

/** An upload that isn't a picture sharp can read (PNG, JPEG, WebP). */
export class BadUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadUploadError";
  }
}

/** Decodes PNG/JPEG/WebP bytes to RGBA, shrunk to at most 128 pixels per side. */
export async function decodeUpload(bytes: Uint8Array): Promise<RgbaImage> {
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: 64_000_000 });
    const meta = await image.metadata();
    if (!meta.format || !["png", "jpeg", "webp"].includes(meta.format)) {
      throw new BadUploadError(`The upload is ${meta.format ?? "not a picture"}; send a PNG, JPEG or WebP`);
    }
    const { data, info } = await image
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
      .toColourspace("srgb") // a grey PNG would otherwise stay one channel
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  } catch (err) {
    if (err instanceof BadUploadError) throw err;
    throw new BadUploadError(`The upload couldn't be read as a picture (PNG, JPEG or WebP): ${err instanceof Error ? err.message : String(err)}`);
  }
}
