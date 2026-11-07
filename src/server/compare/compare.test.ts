/**
 * Comparing a picture with a screenshot, on drawn test pictures: two icons in a row (a red and a blue square with a
 * dark 1-unit border inside), drawn at a known scale on a grey background, found again from a larger picture.
 */
import { describe, expect, test } from "vitest";
import { align, backgroundOf, comparisonImage, measure, type PictureRegion, type Rgb } from "./compare";
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
    texts: [],
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
});
