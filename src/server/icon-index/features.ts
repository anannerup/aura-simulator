/**
 * Image features for finding an icon or texture by its look: a texture is kept as a small grid (`GRID`×`GRID` cells
 * of its colour, composited over black, and its opacity), and two images are compared as `COMPARE`×`COMPARE` cell
 * averages of a square part of each, by root-mean-square difference (0 = equal, 1 = black against white everywhere).
 * Pure; no I/O.
 *
 * Robustness: a player's crop may show an icon zoomed (WeakAuras' icon `zoom` cuts `zoom / 4` off each edge of the
 * art: `texWidth = 1 - 0.5 * zoom` in RegionTypes/Icon.lua), with a border drawn over its edge or background around
 * it. So the upload is compared at a few insets of its own (`UPLOAD_INSETS`), each against the part of the art that
 * inset shows at a zoom (`artInset`), and the best zoom and inset count: coarse zoom steps to rank every icon, then
 * fine steps for the best ones' zoom (`measure`). Textures aren't zoomed; their see-through parts are compared over
 * the upload's background (the median colour of its edge).
 *
 * Grey mode compares luminance only, for screenshots of desaturated icons. Icons of one family often differ only in
 * colour (e.g. the same potion bottle in red, blue and green), so grey mode scores them nearly alike.
 */

/** Cells per side of a stored grid. */
export const GRID = 16;
/** Channels per stored cell: red, green, blue (composited over black) and opacity. */
const CELL = 4;
/** Cells per side of the compared parts. */
export const COMPARE = 8;
/** Fractions cut off each edge of the upload before comparing (a border over the art, or background around it). */
export const UPLOAD_INSETS = [0, 0.05, 0.1] as const;
/** Below this mean saturation (0..1) an upload counts as desaturated: `auto` compares it in grey. */
export const GREY_SATURATION = 0.06;

export type CompareMode = "colour" | "grey";

/** RGBA pixels, row-major, top row first (what `decodeTexture` and the upload decoder give). */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

/** Weighted source pixels for each output cell of an area-average resample. */
interface Sampler {
  /** Cell c's taps are `index`/`weight` from `start[c]` to `start[c + 1]` (flat, as every icon of a search runs them). */
  start: Int32Array;
  index: Int32Array;
  weight: Float32Array;
}

/**
 * Area-average sampler from the square `[inset, 1 - inset]` part of a `width`×`height` image to `n`×`n` cells:
 * each cell averages the source pixels it covers, weighted by how much of each it covers.
 */
function sampler(width: number, height: number, inset: number, n: number): Sampler {
  const axis = (size: number) => {
    const start = inset * size;
    const step = (size * (1 - 2 * inset)) / n;
    return Array.from({ length: n }, (_, i) => {
      const a = start + i * step;
      const b = a + step;
      const taps: [number, number][] = [];
      for (let p = Math.floor(a); p < Math.min(size, Math.ceil(b)); p++) {
        const w = Math.min(b, p + 1) - Math.max(a, p);
        if (w > 1e-9) taps.push([p, w]);
      }
      return taps;
    });
  };
  const xs = axis(width);
  const ys = axis(height);
  const start = [0];
  const index: number[] = [];
  const weight: number[] = [];
  for (const ty of ys) {
    for (const tx of xs) {
      let total = 0;
      for (const [, wy] of ty) for (const [, wx] of tx) total += wx * wy;
      for (const [y, wy] of ty) {
        for (const [x, wx] of tx) {
          index.push(y * width + x);
          weight.push((wx * wy) / total);
        }
      }
      start.push(index.length);
    }
  }
  return { start: Int32Array.from(start), index: Int32Array.from(index), weight: Float32Array.from(weight) };
}

/**
 * Cell averages (0..1) of pixels (0..255, `stride` values each: red, green, blue composited over black, then opacity
 * when `stride` is 4), drawn over `backdrop` (0..1 RGB) where they are see-through, in `mode`'s channels.
 */
function sample(s: Sampler, pixels: Uint8Array, stride: 3 | 4, mode: CompareMode, backdrop: readonly number[] = [0, 0, 0]): Float32Array {
  const cells = s.start.length - 1;
  const out = new Float32Array(cells * (mode === "grey" ? 1 : 3));
  const { start, index, weight } = s;
  for (let c = 0; c < cells; c++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let k = start[c]; k < start[c + 1]; k++) {
      const p = index[k] * stride;
      const w = weight[k];
      r += pixels[p] * w;
      g += pixels[p + 1] * w;
      b += pixels[p + 2] * w;
      a += (stride === 4 ? pixels[p + 3] : 255) * w;
    }
    const see = 1 - a / 255;
    r = r / 255 + see * backdrop[0];
    g = g / 255 + see * backdrop[1];
    b = b / 255 + see * backdrop[2];
    if (mode === "grey") out[c] = 0.299 * r + 0.587 * g + 0.114 * b;
    else {
      out[c * 3] = r;
      out[c * 3 + 1] = g;
      out[c * 3 + 2] = b;
    }
  }
  return out;
}

/** RGB of RGBA pixels composited over black (an upload is a screenshot: opaque). */
function opaqueRgb(image: RgbaImage): Uint8Array {
  const n = image.width * image.height;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = image.data[i * 4 + 3] / 255;
    out[i * 3] = Math.round(image.data[i * 4] * a);
    out[i * 3 + 1] = Math.round(image.data[i * 4 + 1] * a);
    out[i * 3 + 2] = Math.round(image.data[i * 4 + 2] * a);
  }
  return out;
}

/** A texture's stored features: the whole texture as a `GRID`×`GRID` grid of colour (over black) and opacity (bytes). */
export function textureGrid(image: RgbaImage): Uint8Array {
  const s = sampler(image.width, image.height, 0, GRID);
  const out = new Uint8Array(GRID * GRID * CELL);
  for (let c = 0; c < GRID * GRID; c++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let k = s.start[c]; k < s.start[c + 1]; k++) {
      const p = s.index[k] * 4;
      const w = s.weight[k];
      const alpha = image.data[p + 3] / 255;
      r += image.data[p] * alpha * w;
      g += image.data[p + 1] * alpha * w;
      b += image.data[p + 2] * alpha * w;
      a += image.data[p + 3] * w;
    }
    out.set([Math.round(r), Math.round(g), Math.round(b), Math.round(a)], c * CELL);
  }
  return out;
}

/** Mean saturation (max - min channel, 0..1) of an image's pixels, composited over black. */
export function meanSaturation(image: RgbaImage): number {
  const rgb = opaqueRgb(image);
  let sum = 0;
  for (let i = 0; i < rgb.length; i += 3) sum += Math.max(rgb[i], rgb[i + 1], rgb[i + 2]) - Math.min(rgb[i], rgb[i + 1], rgb[i + 2]);
  return rgb.length ? sum / (rgb.length / 3) / 255 : 0;
}

/** The mode `auto` picks for an upload: grey when it is nearly unsaturated. */
export function autoMode(saturation: number): CompareMode {
  return saturation < GREY_SATURATION ? "grey" : "colour";
}

/** The median colour (0..1 RGB) of an image's edge pixels: what is behind a texture's see-through parts. */
function edgeColour(image: RgbaImage): number[] {
  const { width: w, height: h, data } = image;
  const edge: number[] = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
  return [0, 1, 2].map((c) => {
    const v = edge.map((p) => (data[p * 4 + c] * data[p * 4 + 3]) / 255).sort((a, b) => a - b);
    return (v[v.length >> 1] ?? 0) / 255;
  });
}

/** How well a texture matches: its distance, the zoom it is drawn at and how much of the upload's edge was left out. */
export interface TextureMatch {
  distance: number;
  /** The WeakAuras icon `zoom` (0-1) the upload shows an icon at; 0 for a texture. */
  zoom: number;
  /** Fraction cut off each edge of the upload before comparing (a border over the art, or background around it). */
  uploadInset: number;
}

/**
 * The part of an icon's art the middle of the upload shows: an icon drawn at `zoom` shows its art from `zoom / 4` to
 * `1 - zoom / 4` (Icon.lua: texture coordinates `(c - 0.5) × (1 - zoom / 2) + 0.5`) over the whole upload, so the
 * upload without `uploadInset` of each edge shows the art from this inset on.
 */
export function artInset(zoom: number, uploadInset: number): number {
  return zoom / 4 + uploadInset * (1 - zoom / 2);
}

/** Zooms every icon is ranked at (a coarse step; the best few are then measured finely, `ZOOM_STEP`). */
const RANKING_ZOOMS = Array.from({ length: 9 }, (_, i) => Math.round(i * 12) / 100);
/** The step of the fine zoom measurement, and how far around the ranking's zoom it looks. */
const ZOOM_STEP = 0.01;
const ZOOM_REACH = 0.12;
/**
 * The largest upload inset the fine measurement tries (in the same steps): a border or background around the icon is
 * left out exactly, which the zoom depends on (`artInset`).
 */
const FINE_UPLOAD_INSET = 0.15;

/** Samplers of a stored grid, by art inset. */
const gridSamplers = new Map<number, Sampler>();
function gridSampler(inset: number): Sampler {
  const key = Math.round(inset * 100000) / 100000;
  let s = gridSamplers.get(key);
  if (!s) gridSamplers.set(key, (s = sampler(GRID, GRID, key, COMPARE)));
  return s;
}

/** Compares one upload against stored grids in one mode; build once per request, then `match` each candidate. */
export interface TextureMatcher {
  mode: CompareMode;
  /** The distance at coarse zoom steps (icons) or unzoomed (textures): enough to rank every candidate. */
  match(grid: Uint8Array): TextureMatch;
  /** An icon's zoom measured in fine steps around a ranking match, with the distance there. */
  measure(grid: Uint8Array, around: TextureMatch): TextureMatch;
}

/**
 * A matcher of `upload` against icons (`zoomed`: the icon region's zoom is searched) or textures (drawn whole, their
 * see-through parts over the upload's background).
 */
export function textureMatcher(upload: RgbaImage, mode: CompareMode, { zoomed }: { zoomed: boolean }): TextureMatcher {
  const rgb = opaqueRgb(upload);
  const backdrop = zoomed ? [0, 0, 0] : edgeColour(upload);
  const query = (inset: number) => ({ inset, cells: sample(sampler(upload.width, upload.height, inset, COMPARE), rgb, 3, mode) });
  const queries = UPLOAD_INSETS.map(query);
  const fineQueries = Array.from({ length: Math.round(FINE_UPLOAD_INSET / ZOOM_STEP) + 1 }, (_, i) => query(Math.round(i * ZOOM_STEP * 100) / 100));
  const best = (grid: Uint8Array, zooms: readonly number[], insets = queries): TextureMatch => {
    let found: TextureMatch = { distance: Infinity, zoom: 0, uploadInset: 0 };
    for (const zoom of zooms) {
      for (const q of insets) {
        const cells = sample(gridSampler(artInset(zoom, q.inset)), grid, CELL, mode, backdrop);
        let sum = 0;
        for (let k = 0; k < cells.length; k++) sum += (cells[k] - q.cells[k]) ** 2;
        const distance = Math.sqrt(sum / cells.length);
        if (distance < found.distance) found = { distance, zoom, uploadInset: q.inset };
      }
    }
    return found;
  };
  return {
    mode,
    match: (grid) => best(grid, zoomed ? RANKING_ZOOMS : [0]),
    measure(grid, around) {
      if (!zoomed) return around;
      const steps = Math.round(ZOOM_REACH / ZOOM_STEP);
      const zooms: number[] = [];
      for (let i = -steps; i <= steps; i++) {
        const zoom = Math.round((around.zoom + i * ZOOM_STEP) * 100) / 100;
        if (zoom >= 0 && zoom <= 1) zooms.push(zoom);
      }
      const fine = best(grid, zooms, fineQueries);
      return fine.distance <= around.distance ? fine : around;
    },
  };
}
