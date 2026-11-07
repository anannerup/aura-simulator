/**
 * Raw RGBA pictures on the server, decoded, resized and encoded with sharp (PNG, JPEG, WebP, … in; PNG out).
 */
import sharp from "sharp";

/** A picture as straight (not premultiplied) RGBA bytes, row-major, top row first. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Largest picture side read from an upload (pixels). */
export const MAX_IMAGE_SIDE = 4096;

export class ImageError extends Error {}

/** Decodes an image file to RGBA; throws `ImageError` for what isn't a picture or is too large. */
export async function decodeImage(bytes: Uint8Array): Promise<RgbaImage> {
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE) throw new ImageError(`The picture is ${info.width} × ${info.height} pixels, over ${MAX_IMAGE_SIDE}: crop it to the aura`);
    return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  } catch (e) {
    if (e instanceof ImageError) throw e;
    throw new ImageError(`Not a picture sharp can read (PNG, JPEG, WebP, …): ${(e as Error).message}`);
  }
}

const raw = (img: RgbaImage) => sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });

/** `img` resized to `width` × `height` (area-weighted when smaller, as a scaled-down UI would blend). */
export async function resizeImage(img: RgbaImage, width: number, height: number): Promise<RgbaImage> {
  if (width === img.width && height === img.height) return img;
  const { data, info } = await raw(img).resize(Math.max(1, width), Math.max(1, height), { fit: "fill", kernel: "linear" }).raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}

export async function encodePng(img: RgbaImage): Promise<Buffer> {
  return raw(img).png().toBuffer();
}
