import type { DecodedTexture } from "./decode";

/** RGB in 0..1, as WoW's SetVertexColor takes it. */
export type Rgb = readonly [number, number, number];

/** Texture coordinates in SetTexCoord order: left, right, top, bottom (0..1). */
export type TexCoord = readonly [number, number, number, number];

export interface TextureVariant {
  /** SetDesaturated(true): replace RGB by its luminance before tinting. */
  desaturate?: boolean;
  /** SetVertexColor RGB: multiplies the texture colour. Alpha is left to the caller (CSS opacity). */
  tint?: Rgb;
  /** Crop to this texcoord rect first (e.g. one atlas member), so large atlases stay small. */
  crop?: TexCoord;
}

/**
 * Applies WoW's per-texture colour operations to RGBA pixels: optional desaturation, then
 * multiplication by the vertex colour. Alpha is untouched.
 */
export function shadePixels(src: Uint8ClampedArray, variant: TextureVariant): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  const [tr, tg, tb] = variant.tint ?? [1, 1, 1];
  for (let i = 0; i < out.length; i += 4) {
    let r = out[i];
    let g = out[i + 1];
    let b = out[i + 2];
    if (variant.desaturate) {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = y;
    }
    out[i] = r * tr;
    out[i + 1] = g * tg;
    out[i + 2] = b * tb;
  }
  return out;
}

/** Pixel rect covered by a texcoord rect on a texture of the given size (rounded outwards). */
export function texCoordPixelRect(coord: TexCoord, width: number, height: number) {
  const left = Math.max(0, Math.floor(coord[0] * width + 1e-6));
  const right = Math.min(width, Math.ceil(coord[1] * width - 1e-6));
  const top = Math.max(0, Math.floor(coord[2] * height + 1e-6));
  const bottom = Math.min(height, Math.ceil(coord[3] * height - 1e-6));
  return { left, top, width: right - left, height: bottom - top };
}

export function cropTexture(tex: DecodedTexture, coord: TexCoord): DecodedTexture {
  const r = texCoordPixelRect(coord, tex.width, tex.height);
  const data = new Uint8ClampedArray(r.width * r.height * 4);
  for (let y = 0; y < r.height; y++) {
    const start = ((r.top + y) * tex.width + r.left) * 4;
    data.set(tex.data.subarray(start, start + r.width * 4), y * r.width * 4);
  }
  return { width: r.width, height: r.height, data };
}

/**
 * CSS background sizing that shows the texcoord rect `coord` of a texture stretched over a
 * `width`×`height` box, like a WoW texture with SetTexCoord. `coord` is relative to the image
 * actually used as background (after any crop).
 */
export function texCoordBackground(coord: TexCoord, width: number, height: number) {
  const [l, r, t, b] = coord;
  const bgWidth = width / (r - l);
  const bgHeight = height / (b - t);
  return {
    backgroundSize: `${bgWidth}px ${bgHeight}px`,
    backgroundPosition: `${-l * bgWidth}px ${-t * bgHeight}px`,
  };
}

/** Maps a texcoord rect given on the full texture into the coordinates of a cropped sub-rect. */
export function texCoordWithin(inner: TexCoord, crop: TexCoord): TexCoord {
  const w = crop[1] - crop[0];
  const h = crop[3] - crop[2];
  return [(inner[0] - crop[0]) / w, (inner[1] - crop[0]) / w, (inner[2] - crop[2]) / h, (inner[3] - crop[2]) / h];
}
