/**
 * Image features for finding an icon by its look: an icon is kept as a small RGB grid (`GRID`×`GRID`, alpha
 * composited over black), and two images are compared as `COMPARE`×`COMPARE` cell averages of a square part of each,
 * by root-mean-square difference (0 = equal, 1 = black against white everywhere). Pure; no I/O.
 *
 * Robustness: a player's crop of an icon may include the icon's own dark edge, a border around it, or show it zoomed
 * (WeakAuras' icon `zoom` cuts `zoom / 4` off each edge of the art: `texWidth = 1 - 0.5 * zoom` in
 * RegionTypes/Icon.lua). So each icon is compared at several insets (`ICON_INSETS`) against the upload at a few
 * insets of its own (`UPLOAD_INSETS`), and the best pair counts.
 *
 * Grey mode compares luminance only, for screenshots of desaturated icons. Icons of one family often differ only in
 * colour (e.g. the same potion bottle in red, blue and green), so grey mode scores them nearly alike.
 */

/** Cells per side of a stored icon grid. */
export const GRID = 16;
/** Cells per side of the compared parts. */
export const COMPARE = 8;
/** Fractions cut off each edge of an icon before comparing: WeakAuras zoom 0, 0.12, … 1 (`zoom = 4 × inset`). */
export const ICON_INSETS = [0, 0.03, 0.06, 0.09, 0.12, 0.16, 0.2, 0.25] as const;
/** Fractions cut off each edge of the upload before comparing (a border or background around the icon). */
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

/** Cell averages (0..1) of RGB pixels (0..255, 3 values each), in `mode`'s channels. */
function sample(s: Sampler, rgb: Uint8Array, mode: CompareMode): Float32Array {
  const cells = s.start.length - 1;
  const out = new Float32Array(cells * (mode === "grey" ? 1 : 3));
  const { start, index, weight } = s;
  for (let c = 0; c < cells; c++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let k = start[c]; k < start[c + 1]; k++) {
      const p = index[k] * 3;
      const w = weight[k];
      r += rgb[p] * w;
      g += rgb[p + 1] * w;
      b += rgb[p + 2] * w;
    }
    if (mode === "grey") out[c] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    else {
      out[c * 3] = r / 255;
      out[c * 3 + 1] = g / 255;
      out[c * 3 + 2] = b / 255;
    }
  }
  return out;
}

/** RGB of RGBA pixels composited over black (the game draws icons opaque; transparent parts show as dark). */
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

/** An icon's stored features: its whole texture as a `GRID`×`GRID` RGB grid (bytes). */
export function iconGrid(image: RgbaImage): Uint8Array {
  const cells = sample(sampler(image.width, image.height, 0, GRID), opaqueRgb(image), "colour");
  return Uint8Array.from(cells, (v) => Math.round(v * 255));
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

/** How well an icon matches: its distance and the insets of the best pair. */
export interface IconMatch {
  distance: number;
  /** Inset cut off each edge of the icon (WeakAuras zoom = 4 × this). */
  iconInset: number;
  /** Inset cut off each edge of the upload. */
  uploadInset: number;
}

/** Compares uploads against icon grids in one mode; build once per request, then `match` each icon. */
export interface IconMatcher {
  mode: CompareMode;
  match(grid: Uint8Array): IconMatch;
}

const GRID_SAMPLERS = ICON_INSETS.map((inset) => sampler(GRID, GRID, inset, COMPARE));

export function iconMatcher(upload: RgbaImage, mode: CompareMode): IconMatcher {
  const rgb = opaqueRgb(upload);
  const queries = UPLOAD_INSETS.map((inset) => ({
    inset,
    cells: sample(sampler(upload.width, upload.height, inset, COMPARE), rgb, mode),
  }));
  return {
    mode,
    match(grid) {
      let best: IconMatch = { distance: Infinity, iconInset: 0, uploadInset: 0 };
      GRID_SAMPLERS.forEach((s, i) => {
        const icon = sample(s, grid, mode);
        for (const q of queries) {
          let sum = 0;
          for (let k = 0; k < icon.length; k++) sum += (icon[k] - q.cells[k]) ** 2;
          const distance = Math.sqrt(sum / icon.length);
          if (distance < best.distance) best = { distance, iconInset: ICON_INSETS[i], uploadInset: q.inset };
        }
      });
      return best;
    },
  };
}
