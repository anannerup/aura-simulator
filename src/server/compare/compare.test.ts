/**
 * Comparing a picture with a screenshot, on drawn test pictures: two icons in a row (a red and a blue square with a
 * dark 1-unit border inside), drawn at a known scale on a grey background, found again from a larger picture.
 */
import { describe, expect, test } from "vitest";
import { align, backgroundOf, comparisonImage, contentMask, measure, textEdge, type PictureRegion, type Rgb } from "./compare";
import { decodeImage, encodePng, resizeImage, type RgbaImage } from "./image";

const ICON = 20; // units
const GAP = 3; // units
const BORDER = 1; // unit
const GREY: Rgb = [60, 60, 60];

/** Two icons side by side at `scale` px per unit, at (`left`, `top`) px on a canvas of `w` × `h` (transparent or `bg`). */
function drawIcons(scale: number, w: number, h: number, left: number, top: number, bg?: Rgb, colours: Rgb[] = [[220, 40, 40], [40, 80, 220]]): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  if (bg) for (let p = 0; p < w * h; p++) data.set([...bg, 255], p * 4);
  const fill = (x0: number, y0: number, x1: number, y1: number, c: Rgb) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) if (x >= 0 && y >= 0 && x < w && y < h) data.set([...c, 255], (y * w + x) * 4);
  };
  colours.forEach((c, i) => {
    const x = left + i * (ICON + GAP) * scale;
    fill(x, top, x + ICON * scale, top + ICON * scale, [10, 10, 10]);
    fill(x + BORDER * scale, top + BORDER * scale, x + (ICON - BORDER) * scale, top + (ICON - BORDER) * scale, c);
  });
  return { width: w, height: h, data };
}

const pictureSize = (scale: number) => ({ w: Math.round((2 * ICON + GAP) * scale), h: Math.round(ICON * scale) });
const regionsAt = (scale: number): PictureRegion[] =>
  [0, 1].map((i) => ({
    auraId: `icon ${i + 1}`,
    regionType: "icon",
    box: { left: Math.round(i * (ICON + GAP) * scale), top: 0, width: Math.round(ICON * scale), height: Math.round(ICON * scale) },
    elements: [],
  }));

describe("compare", () => {
  const SHOT_SCALE = 1.5;
  const MARGIN = { x: 7, y: 5 };
  const shotSize = pictureSize(SHOT_SCALE);
  const shot = drawIcons(SHOT_SCALE, shotSize.w + 2 * MARGIN.x, shotSize.h + 2 * MARGIN.y, MARGIN.x, MARGIN.y, GREY);

  test("reads the background from the screenshot's edge", () => {
    expect(backgroundOf(shot)).toEqual({ colour: GREY, uniform: 1 });
  });

  test("finds the scale and offset from a larger picture", async () => {
    const big = pictureSize(4);
    const picture = drawIcons(4, big.w, big.h, 0, 0);
    const { best, scales } = await align({ shot, background: backgroundOf(shot), picture, pictureScale: 4, resize: resizeImage });
    expect(best.scale).toBeCloseTo(SHOT_SCALE, 1);
    expect(Math.abs(best.dx - MARGIN.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(best.dy - MARGIN.y)).toBeLessThanOrEqual(1);
    expect(best.score).toBeLessThan(15);
    expect(scales.length).toBeGreaterThan(10);
  });

  test("with the scale given, measures the regions, their spacing and colours", async () => {
    const size = pictureSize(SHOT_SCALE);
    const picture = drawIcons(SHOT_SCALE, size.w, size.h, 0, 0);
    const background = backgroundOf(shot);
    const { best } = await align({ shot, background, picture, pictureScale: SHOT_SCALE, scale: SHOT_SCALE, resize: resizeImage });
    expect(best).toMatchObject({ dx: MARGIN.x, dy: MARGIN.y, score: 0, overlap: 1 });
    const m = measure(shot, background, picture, regionsAt(SHOT_SCALE), best);
    expect(m.regions.map((r) => r.delta)).toEqual([
      { left: 0, top: 0, width: 0, height: 0 },
      { left: 0, top: 0, width: 0, height: 0 },
    ]);
    expect(m.regions[0].layoutUnits).toEqual({ left: 0, top: 0, width: ICON, height: ICON });
    // One row of two.
    expect(m.spacing.map((r) => [r.axis, r.auraIds])).toEqual([["x", ["icon 1", "icon 2"]]]);
    expect(m.spacing[0].screenshot?.gap).toEqual(m.spacing[0].picture?.gap);
    expect(m.spacing[0].layout.pitchUnits[0]).toBeCloseTo(ICON + GAP, 0);
    expect(m.regions[1].colour.delta).toEqual([0, 0, 0]);
  });

  test("tells how a different picture differs: a wider gap, another colour", async () => {
    const size = pictureSize(SHOT_SCALE);
    // The picture's second icon is green: the colour difference shows on it alone.
    const picture = drawIcons(SHOT_SCALE, size.w, size.h, 0, 0, undefined, [[220, 40, 40], [40, 200, 40]]);
    const background = backgroundOf(shot);
    const { best } = await align({ shot, background, picture, pictureScale: SHOT_SCALE, scale: SHOT_SCALE, resize: resizeImage });
    const m = measure(shot, background, picture, regionsAt(SHOT_SCALE), best);
    expect(m.regions[0].colour.delta).toEqual([0, 0, 0]);
    expect(m.regions[1].colour.delta![1]).toBeLessThan(-80);
    expect(m.score).toBeGreaterThan(5);
    const comparison = comparisonImage(shot, background, picture, regionsAt(SHOT_SCALE), best, 2);
    expect(comparison.width).toBe(shot.width * 2 * 3 + 8);
    // A PNG sharp reads back.
    const back = await decodeImage(await encodePng(comparison));
    expect(back.height).toBe(shot.height * 2);
  });

  test("says how large a score change means something: the screenshot's pixel noise, the scale's spread, a one-pixel move", async () => {
    const size = pictureSize(SHOT_SCALE);
    const picture = drawIcons(SHOT_SCALE, size.w, size.h, 0, 0);
    const background = backgroundOf(shot);
    const { best } = await align({ shot, background, picture, pictureScale: SHOT_SCALE, scale: SHOT_SCALE, resize: resizeImage });
    const exact = measure(shot, background, picture, regionsAt(SHOT_SCALE), best);
    expect(exact.noise).toMatchObject({ pixel: 0, scale: null, meaningful: 0.1 });
    expect(exact.noise.onePixelShift).toBeGreaterThan(1);
    // A noisy screenshot (JPEG-like speckle on the background) and a searched scale raise the bar.
    const noisy: RgbaImage = { ...shot, data: shot.data.map((v, i) => (i % 4 === 3 ? v : v === 60 ? v + ((i * 7919) % 9) - 4 : v)) };
    const m = measure(noisy, backgroundOf(noisy), picture, regionsAt(SHOT_SCALE), best, 0.8);
    expect(m.noise.pixel).toBeGreaterThan(1);
    expect(m.noise.scale).toBe(0.8);
    expect(m.noise.meaningful).toBe(Math.max(m.noise.pixel, 0.8));
  });
});

describe("display elements", () => {
  const W = 60;
  const H = 30;
  const BG: Rgb = [90, 90, 90];
  /** Two bright bars (like the strokes of "11") at (`x`, `y`) on the background (or on nothing: a picture), with a 1 px black outline, a drop shadow 1 px right and down, or neither. */
  function drawText(edge: "outline" | "shadow" | "none", x = 10, y = 8, transparent = false): RgbaImage {
    const data = new Uint8Array(W * H * 4);
    if (!transparent) for (let p = 0; p < W * H; p++) data.set([...BG, 255], p * 4);
    const fill = (x0: number, y0: number, x1: number, y1: number, c: Rgb) => {
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) data.set([...c, 255], (yy * W + xx) * 4);
    };
    const strokes = [
      [x, y, x + 3, y + 12],
      [x + 8, y, x + 11, y + 12],
    ];
    for (const [x0, y0, x1, y1] of strokes) {
      if (edge === "outline") fill(x0 - 1, y0 - 1, x1 + 1, y1 + 1, [0, 0, 0]);
      if (edge === "shadow") fill(x0 + 1, y0 + 1, x1 + 1, y1 + 1, [0, 0, 0]);
    }
    for (const [x0, y0, x1, y1] of strokes) fill(x0, y0, x1, y1, [255, 255, 255]);
    return { width: W, height: H, data };
  }
  const font = { name: "PT Sans Narrow Bold", size: 12, flags: "OUTLINE", shadow: { x: 0, y: 0 } };
  /** A text display's own text: its line box around the strokes. */
  const textRegion = (left: number): PictureRegion[] => [
    { auraId: "count", regionType: "text", box: { left, top: 8, width: 12, height: 12 }, elements: [{ kind: "text", index: null, box: { left, top: 8, width: 12, height: 12 }, font }] },
  ];

  test("reads whether a text's glyphs have an outline, a drop shadow or neither", () => {
    for (const edge of ["outline", "shadow", "none"] as const) {
      const img = drawText(edge);
      expect(textEdge(img, contentMask(img, BG), { left: 6, top: 4, width: 20, height: 20 }, BG).edge).toBe(edge);
    }
    // On a black background a black rim can't be seen.
    const img = drawText("outline");
    expect(textEdge(img, contentMask(img, [0, 0, 0]), { left: 6, top: 4, width: 20, height: 20 }, [0, 0, 0]).edge).toBe("unknown");
  });

  test("measures each text on its own: where it is drawn, its rows and its edge, in both", () => {
    const shot = drawText("shadow", 12); // the screenshot's text: 2 px further right, with a shadow
    const picture = drawText("outline", 10, 8, true);
    const background = backgroundOf(shot);
    const at = { scale: 1, dx: 0, dy: 0, score: 0, overlap: 1 };
    const [region] = measure(shot, background, picture, textRegion(10), at).regions;
    expect(region.elements).toHaveLength(1);
    const text = region.elements[0];
    expect(text).toMatchObject({ kind: "text", index: null, overlapsOther: false, layoutUnits: { left: 10, top: 8, width: 12, height: 12 } });
    expect(text.text!.font).toEqual(font);
    expect(text.text!.edge.picture.edge).toBe("outline");
    expect(text.text!.edge.screenshot.edge).toBe("shadow");
    expect(text.text!.rows.screenshot).toEqual([13]); // 12 rows of glyph and the shadow's one below
    expect(text.drawn.picture).toEqual({ left: 9, top: 7, width: 13, height: 14 });
    expect(text.drawnUnits.screenshot).toEqual({ left: 12, top: 8, width: 12, height: 13 });
    expect(text.delta).toEqual({ left: 3, top: 1, width: -1, height: -1 });
  });

  test("an element over a display's art says its measurements include the art", () => {
    const icon: PictureRegion = {
      auraId: "icon",
      regionType: "icon",
      box: { left: 5, top: 5, width: 30, height: 20 },
      elements: [
        { kind: "subborder", index: 2, box: { left: 5, top: 5, width: 30, height: 20 } },
        { kind: "subtext", index: 3, box: { left: 10, top: 8, width: 12, height: 12 }, font },
      ],
    };
    const img = drawText("outline");
    const m = measure(img, backgroundOf(img), img, [icon], { scale: 1, dx: 0, dy: 0, score: 0, overlap: 1 });
    expect(m.regions[0].elements.map((e) => [e.kind, e.index, e.overlapsOther])).toEqual([
      ["subborder", 2, true],
      ["subtext", 3, true],
    ]);
    expect(m.regions[0].elements[0].text).toBeUndefined();
  });
});
