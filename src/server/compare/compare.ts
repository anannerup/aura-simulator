/**
 * Comparing a picture of an aura (the render page's) with the player's screenshot of it: where the picture lies on the
 * screenshot and at what scale (game pixels per UI unit), and how the two differ per region. Pure: pictures in
 * (`RgbaImage`), numbers and a comparison picture out; resizing is handed in.
 *
 * The screenshot's background is read from its edge (a crop around the aura); what differs from it is the screenshot's
 * content. The picture is drawn on that background colour, so where either has content they are compared pixel by
 * pixel (the mean colour difference, 0-255: lower is closer).
 */
import type { RgbaImage } from "./image";

/** A box in pixels of the screenshot (or a picture): left/top/width/height. */
export interface PixelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Rgb = [number, number, number];

/** Colour difference of two pixels: the mean of the channels' absolute differences (0-255). */
const distance = (d: Uint8Array, i: number, r: number, g: number, b: number) =>
  (Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b)) / 3;

/** A pixel differs from the background (or another pixel) above this: JPEG noise and dithering stay below it. */
export const CONTENT_THRESHOLD = 28;
/** A picture's pixel is content from this alpha on (0-255). */
const OPAQUE = 128;

export interface Background {
  colour: Rgb;
  /** Share of the screenshot's edge pixels close to `colour` (1: a plain background; low: busy, measurements weaker). */
  uniform: number;
}

/** The screenshot's background: the median colour of its edge pixels. */
export function backgroundOf(img: RgbaImage): Background {
  const { width: w, height: h, data } = img;
  const edge: number[] = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
  const median = (c: number) => {
    const v = edge.map((p) => data[p * 4 + c]).sort((a, b) => a - b);
    return v[v.length >> 1] ?? 0;
  };
  const colour: Rgb = [median(0), median(1), median(2)];
  const close = edge.filter((p) => distance(data, p * 4, ...colour) <= CONTENT_THRESHOLD).length;
  return { colour, uniform: edge.length ? close / edge.length : 0 };
}

/** 1 where the screenshot differs from the background. */
export function contentMask(img: RgbaImage, bg: Rgb): Uint8Array {
  const mask = new Uint8Array(img.width * img.height);
  for (let p = 0; p < mask.length; p++) mask[p] = distance(img.data, p * 4, ...bg) > CONTENT_THRESHOLD ? 1 : 0;
  return mask;
}

/** 1 where a picture is drawn (alpha from `OPAQUE`). */
export function alphaMask(img: RgbaImage): Uint8Array {
  const mask = new Uint8Array(img.width * img.height);
  for (let p = 0; p < mask.length; p++) mask[p] = img.data[p * 4 + 3] >= OPAQUE ? 1 : 0;
  return mask;
}

/** The bounding box of a mask's set pixels inside `window` (default: everywhere); null when none is set. */
export function maskBounds(mask: Uint8Array, width: number, height: number, window?: PixelBox): PixelBox | null {
  const x0 = Math.max(0, window?.left ?? 0);
  const y0 = Math.max(0, window?.top ?? 0);
  const x1 = Math.min(width, window ? window.left + window.width : width);
  const y1 = Math.min(height, window ? window.top + window.height : height);
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!mask[y * width + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < left ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** The picture drawn on a colour (its alpha blended in). */
export function onColour(img: RgbaImage, bg: Rgb): RgbaImage {
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < out.length; i += 4) {
    const a = img.data[i + 3] / 255;
    out[i] = Math.round(img.data[i] * a + bg[0] * (1 - a));
    out[i + 1] = Math.round(img.data[i + 1] * a + bg[1] * (1 - a));
    out[i + 2] = Math.round(img.data[i + 2] * a + bg[2] * (1 - a));
    out[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

/** A picture ready to compare: drawn on the background, with its drawn pixels. */
export interface Placed {
  image: RgbaImage;
  drawn: Uint8Array;
}

export function placeable(picture: RgbaImage, bg: Rgb): Placed {
  return { image: onColour(picture, bg), drawn: alphaMask(picture) };
}

/**
 * The mean colour difference where the screenshot or the picture (its top left at `dx`, `dy`) has content, and the
 * share of those pixels where both have it (overlap). A drawn pixel of the picture off the screenshot counts as 255.
 */
export function scoreAt(shot: RgbaImage, shotMask: Uint8Array, bg: Rgb, placed: Placed, dx: number, dy: number): { score: number; overlap: number } {
  const { width: w, height: h, data } = shot;
  const { image: pic, drawn } = placed;
  let sum = 0;
  let count = 0;
  let both = 0;
  const x0 = Math.min(0, dx);
  const y0 = Math.min(0, dy);
  const x1 = Math.max(w, dx + pic.width);
  const y1 = Math.max(h, dy + pic.height);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const inShot = x >= 0 && y >= 0 && x < w && y < h;
      const px = x - dx;
      const py = y - dy;
      const inPic = px >= 0 && py >= 0 && px < pic.width && py < pic.height;
      const s = inShot && shotMask[y * w + x] === 1;
      const p = inPic && drawn[py * pic.width + px] === 1;
      if (!s && !p) continue;
      count++;
      if (s && p) both++;
      if (!inShot) {
        sum += 255;
        continue;
      }
      const si = (y * w + x) * 4;
      if (inPic) {
        const pi = (py * pic.width + px) * 4;
        sum += distance(data, si, pic.data[pi], pic.data[pi + 1], pic.data[pi + 2]);
      } else sum += distance(data, si, ...bg);
    }
  }
  return count === 0 ? { score: 255, overlap: 0 } : { score: sum / count, overlap: both / count };
}

export interface Alignment {
  /** Game pixels per UI unit. */
  scale: number;
  /** Where the picture's top left lies on the screenshot (pixels). */
  dx: number;
  dy: number;
  score: number;
  overlap: number;
}

/** The best offset of a placed picture within `reach` pixels of (`cx`, `cy`). */
export function bestOffset(shot: RgbaImage, shotMask: Uint8Array, bg: Rgb, placed: Placed, cx: number, cy: number, reach: number) {
  let best = { dx: cx, dy: cy, score: Infinity, overlap: 0 };
  for (let dy = cy - reach; dy <= cy + reach; dy++) {
    for (let dx = cx - reach; dx <= cx + reach; dx++) {
      const s = scoreAt(shot, shotMask, bg, placed, dx, dy);
      if (s.score < best.score) best = { dx, dy, ...s };
    }
  }
  return best;
}

export interface AlignInput {
  shot: RgbaImage;
  background: Background;
  /** The aura's picture at `pictureScale` pixels per UI unit (drawn larger than the screenshot shows it, to resize down). */
  picture: RgbaImage;
  pictureScale: number;
  /** A known scale (the player's UI scale): only the offset is searched. */
  scale?: number;
  resize(img: RgbaImage, width: number, height: number): Promise<RgbaImage>;
}

export interface AlignResult {
  best: Alignment;
  /** The best alignment at each scale tried, best first (several close scores: the scale is ambiguous). */
  scales: Alignment[];
}

/** Steps of the scale search around the content boxes' ratio: ±15 % in 1 % steps. */
const SCALE_STEPS = Array.from({ length: 31 }, (_, i) => 0.85 + i * 0.01);

/**
 * Finds the scale and offset that lay the picture over the screenshot best. The first guess makes the content boxes
 * the same size and lines up their centres; scales within ±15 % of it are tried (at offsets within a pixel of the
 * centred one), then the best few are searched within a few pixels.
 */
export async function align(input: AlignInput): Promise<AlignResult> {
  const { shot, background, picture, pictureScale } = input;
  const bg = background.colour;
  const shotMask = contentMask(shot, bg);
  const shotBox = maskBounds(shotMask, shot.width, shot.height);
  const picBox = maskBounds(alphaMask(picture), picture.width, picture.height);
  if (!shotBox) throw new CompareError("The screenshot shows nothing but its background colour: crop it around the aura with some background left at the edges");
  if (!picBox) throw new CompareError("The aura draws nothing in this situation");
  const guess = input.scale ?? pictureScale * Math.sqrt((shotBox.width / picBox.width) * (shotBox.height / picBox.height));
  const factors = input.scale !== undefined ? [1] : SCALE_STEPS;
  const tried: (Alignment & { placed: Placed })[] = [];
  for (const f of factors) {
    const scale = guess * f;
    const k = scale / pictureScale;
    const w = Math.max(1, Math.round(picture.width * k));
    const h = Math.max(1, Math.round(picture.height * k));
    const placed = placeable(await input.resize(picture, w, h), bg);
    // Centres of the content boxes on each other.
    const cx = Math.round(shotBox.left + shotBox.width / 2 - (picBox.left + picBox.width / 2) * (w / picture.width));
    const cy = Math.round(shotBox.top + shotBox.height / 2 - (picBox.top + picBox.height / 2) * (h / picture.height));
    const o = bestOffset(shot, shotMask, bg, placed, cx, cy, factors.length > 1 ? 1 : 4);
    tried.push({ scale, ...o, placed });
  }
  tried.sort((a, b) => a.score - b.score);
  for (const t of tried.slice(0, 3)) Object.assign(t, bestOffset(shot, shotMask, bg, t.placed, t.dx, t.dy, 3));
  tried.sort((a, b) => a.score - b.score);
  const scales = tried.map(({ scale, dx, dy, score, overlap }) => ({ scale, dx, dy, score, overlap }));
  return { best: scales[0], scales };
}

export class CompareError extends Error {}

/** One region of the aura's picture: where the page laid it out (pixels of the picture at its scale). */
export interface PictureRegion {
  auraId: string;
  regionType: string;
  box: PixelBox;
  /** Its texts' boxes (text sub elements; a text region's own text). */
  texts: PixelBox[];
}

export interface RegionMetrics {
  auraId: string;
  regionType: string;
  /** The region's frame as laid out, on the screenshot (pixels) and in UI units. */
  layout: PixelBox;
  layoutUnits: PixelBox;
  /** What is drawn around the frame (a few pixels beyond it, for borders drawn outside): in the picture and the screenshot. */
  drawn: { picture: PixelBox | null; screenshot: PixelBox | null };
  /** screenshot − picture (pixels): left, top, width, height; null when either draws nothing there. */
  delta: PixelBox | null;
  /** Mean colour of the content inside the frame, in each, and screenshot − picture. */
  colour: { picture: Rgb | null; screenshot: Rgb | null; delta: Rgb | null };
  /** Rows of text: the heights (pixels) of the runs of rows with content in each text's box, in each. */
  textRows: { picture: number[]; screenshot: number[] }[];
}

/** From each box's start to the next one's (pitch) and the empty space between them (gap): pixels and UI units. */
export interface Gaps {
  pitch: number[];
  gap: number[];
  pitchUnits: number[];
  gapUnits: number[];
}

/** A row (axis x) or column (axis y) of regions, in order. */
export interface Run {
  axis: "x" | "y";
  auraIds: string[];
  /** Of their frames as laid out, of what the picture draws around each, and of what the screenshot shows there. */
  layout: Gaps;
  picture: Gaps | null;
  screenshot: Gaps | null;
}

export interface CompareMetrics {
  regions: RegionMetrics[];
  /** The regions' rows and columns, with their pitch and gaps. */
  spacing: Run[];
  /** The mean colour difference where either has content (0-255), and the share of those pixels both draw. */
  score: number;
  overlap: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const shift = (b: PixelBox, dx: number, dy: number): PixelBox => ({ left: b.left + dx, top: b.top + dy, width: b.width, height: b.height });
const grow = (b: PixelBox, m: number): PixelBox => ({ left: b.left - m, top: b.top - m, width: b.width + 2 * m, height: b.height + 2 * m });
const units = (b: PixelBox, scale: number, dx: number, dy: number): PixelBox => ({
  left: round2((b.left - dx) / scale),
  top: round2((b.top - dy) / scale),
  width: round2(b.width / scale),
  height: round2(b.height / scale),
});

/** How far apart two boxes are (pixels; 0 when they touch or overlap). */
const apart = (a: PixelBox, b: PixelBox) =>
  Math.max(0, b.left - (a.left + a.width), a.left - (b.left + b.width), b.top - (a.top + a.height), a.top - (b.top + b.height));

/** The picture on the screenshot's canvas at an offset: its drawn pixels, and its colours there. */
function onCanvas(shot: RgbaImage, placed: Placed, dx: number, dy: number): { mask: Uint8Array; image: RgbaImage } {
  const { width: w, height: h } = shot;
  const mask = new Uint8Array(w * h);
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x - dx;
      const py = y - dy;
      if (px < 0 || py < 0 || px >= placed.image.width || py >= placed.image.height) continue;
      const pi = py * placed.image.width + px;
      mask[y * w + x] = placed.drawn[pi];
      data.set(placed.image.data.subarray(pi * 4, pi * 4 + 4), (y * w + x) * 4);
    }
  }
  return { mask, image: { width: w, height: h, data } };
}

function meanColour(img: RgbaImage, mask: Uint8Array, box: PixelBox): Rgb | null {
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = Math.max(0, box.top); y < Math.min(img.height, box.top + box.height); y++) {
    for (let x = Math.max(0, box.left); x < Math.min(img.width, box.left + box.width); x++) {
      const p = y * img.width + x;
      if (!mask[p]) continue;
      n++;
      for (let c = 0; c < 3; c++) sum[c] += img.data[p * 4 + c];
    }
  }
  return n === 0 ? null : (sum.map((s) => Math.round(s / n)) as Rgb);
}

/** Heights of the runs of rows that have content inside `box`. */
function rowRuns(mask: Uint8Array, width: number, height: number, box: PixelBox): number[] {
  const runs: number[] = [];
  let run = 0;
  for (let y = Math.max(0, box.top); y < Math.min(height, box.top + box.height); y++) {
    let any = false;
    for (let x = Math.max(0, box.left); x < Math.min(width, box.left + box.width) && !any; x++) any = mask[y * width + x] === 1;
    if (any) run++;
    else if (run) {
      runs.push(run);
      run = 0;
    }
  }
  if (run) runs.push(run);
  return runs;
}

/** Pitch and gaps of boxes in order along an axis. */
function gaps(boxes: PixelBox[], axis: "x" | "y", scale: number): Gaps {
  const start = (b: PixelBox) => (axis === "x" ? b.left : b.top);
  const size = (b: PixelBox) => (axis === "x" ? b.width : b.height);
  const pitch = boxes.slice(1).map((b, i) => start(b) - start(boxes[i]));
  const gap = boxes.slice(1).map((b, i) => start(b) - start(boxes[i]) - size(boxes[i]));
  return { pitch, gap, pitchUnits: pitch.map((p) => round2(p / scale)), gapUnits: gap.map((g) => round2(g / scale)) };
}

/**
 * The rows (axis x) and columns (axis y) of regions: regions whose frames overlap across the axis by at least half the
 * smaller one, in order along it, with two or more in them.
 */
function runs(regions: RegionMetrics[], scale: number): Run[] {
  const out: Run[] = [];
  for (const axis of ["x", "y"] as const) {
    const across = (b: PixelBox): [number, number] => (axis === "x" ? [b.top, b.top + b.height] : [b.left, b.left + b.width]);
    const along = (b: PixelBox) => (axis === "x" ? b.left : b.top);
    const lines: RegionMetrics[][] = [];
    for (const r of [...regions].sort((a, b) => along(a.layout) - along(b.layout))) {
      const [a0, a1] = across(r.layout);
      const line = lines.find((l) => {
        const [b0, b1] = across(l[0].layout);
        return Math.min(a1, b1) - Math.max(a0, b0) >= 0.5 * Math.min(a1 - a0, b1 - b0);
      });
      if (line) line.push(r);
      else lines.push([r]);
    }
    for (const line of lines.filter((l) => l.length > 1)) {
      const drawn = (key: "picture" | "screenshot") => (line.every((r) => r.drawn[key]) ? gaps(line.map((r) => r.drawn[key]!), axis, scale) : null);
      out.push({ axis, auraIds: line.map((r) => r.auraId), layout: gaps(line.map((r) => r.layout), axis, scale), picture: drawn("picture"), screenshot: drawn("screenshot") });
    }
  }
  return out;
}

/**
 * Per region of the picture (laid on the screenshot at the alignment): its frame, what each draws around it, their
 * mean colours and text rows; and the spacing of the regions, laid out and measured.
 */
export function measure(shot: RgbaImage, background: Background, picture: RgbaImage, regions: PictureRegion[], at: Alignment): CompareMetrics {
  const bg = background.colour;
  const shotMask = contentMask(shot, bg);
  const placed = placeable(picture, bg);
  const canvas = onCanvas(shot, placed, at.dx, at.dy);
  const { width: w, height: h } = shot;
  const out: RegionMetrics[] = regions.map((r) => {
    const layout = shift(r.box, at.dx, at.dy);
    // Borders drawn outside the frame and texts overhanging it count, up to a fifth of the frame's size and half way
    // to the nearest other region.
    const nearest = Math.min(...regions.filter((o) => o !== r).map((o) => apart(r.box, o.box)));
    const margin = Math.min(Math.max(2, Math.round(0.2 * Math.min(layout.width, layout.height))), Math.floor(nearest / 2));
    const around = grow(layout, margin);
    const drawnPicture = maskBounds(canvas.mask, w, h, around);
    const drawnShot = maskBounds(shotMask, w, h, around);
    const delta =
      drawnPicture && drawnShot
        ? {
            left: drawnShot.left - drawnPicture.left,
            top: drawnShot.top - drawnPicture.top,
            width: drawnShot.width - drawnPicture.width,
            height: drawnShot.height - drawnPicture.height,
          }
        : null;
    const cp = meanColour(canvas.image, canvas.mask, layout);
    const cs = meanColour(shot, shotMask, layout);
    const textRows = r.texts.map((t) => {
      const box = grow(shift(t, at.dx, at.dy), 2);
      return { picture: rowRuns(canvas.mask, w, h, box), screenshot: rowRuns(shotMask, w, h, box) };
    });
    return {
      auraId: r.auraId,
      regionType: r.regionType,
      layout,
      layoutUnits: units(layout, at.scale, at.dx, at.dy),
      drawn: { picture: drawnPicture, screenshot: drawnShot },
      delta,
      colour: { picture: cp, screenshot: cs, delta: cp && cs ? (cs.map((c, i) => c - cp[i]) as Rgb) : null },
      textRows,
    };
  });
  const s = scoreAt(shot, shotMask, bg, placed, at.dx, at.dy);
  return {
    regions: out,
    spacing: runs(out, at.scale),
    score: round2(s.score),
    overlap: round2(s.overlap),
  };
}

/**
 * The comparison picture: the screenshot, the picture drawn on its background at the alignment, and their difference
 * (the screenshot dimmed, red where they differ), side by side, each enlarged `zoom` times (nearest neighbour), with
 * the regions' frames outlined in magenta on the first two.
 */
export function comparisonImage(shot: RgbaImage, background: Background, picture: RgbaImage, regions: PictureRegion[], at: Alignment, zoom: number): RgbaImage {
  const bg = background.colour;
  const { width: w, height: h } = shot;
  const canvas = onCanvas(shot, placeable(picture, bg), at.dx, at.dy);
  const gapPx = 4;
  const pw = w * zoom;
  const ph = h * zoom;
  const out: RgbaImage = { width: pw * 3 + gapPx * 2, height: ph, data: new Uint8Array((pw * 3 + gapPx * 2) * ph * 4) };
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * out.width + x) * 4;
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = 255;
  };
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) set(x, y, 40, 40, 40);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const s = shot.data;
      const drawn = canvas.mask[y * w + x] === 1;
      const p = drawn ? canvas.image.data : null;
      const pr = p ? p[i] : bg[0];
      const pg = p ? p[i + 1] : bg[1];
      const pb = p ? p[i + 2] : bg[2];
      const d = (Math.abs(s[i] - pr) + Math.abs(s[i + 1] - pg) + Math.abs(s[i + 2] - pb)) / 3;
      const grey = (s[i] + s[i + 1] + s[i + 2]) / 9;
      for (let zy = 0; zy < zoom; zy++) {
        for (let zx = 0; zx < zoom; zx++) {
          const X = x * zoom + zx;
          const Y = y * zoom + zy;
          set(X, Y, s[i], s[i + 1], s[i + 2]);
          set(pw + gapPx + X, Y, pr, pg, pb);
          set(2 * (pw + gapPx) + X, Y, Math.min(255, grey + d * 2), grey, grey);
        }
      }
    }
  }
  for (const r of regions) {
    const b = shift(r.box, at.dx, at.dy);
    for (const panel of [0, pw + gapPx]) {
      const x0 = b.left * zoom;
      const y0 = b.top * zoom;
      const x1 = (b.left + b.width) * zoom - 1;
      const y1 = (b.top + b.height) * zoom - 1;
      const dot = (x: number, y: number) => {
        if (x >= 0 && y >= 0 && x < pw && y < ph) set(panel + x, y, 255, 0, 255);
      };
      for (let x = x0; x <= x1; x++) {
        dot(x, y0);
        dot(x, y1);
      }
      for (let y = y0; y <= y1; y++) {
        dot(x0, y);
        dot(x1, y);
      }
    }
  }
  return out;
}
