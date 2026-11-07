import { describe, expect, it } from "vitest";
import { pixelBox } from "./pixel-grid";

describe("snapping to the pixel grid", () => {
  it("puts each edge of a box on a whole pixel, counted from the pixel the frame starts in", () => {
    // 1.5 pixels per unit, the frame 0.3 pixels into pixel 20: a 10-unit box at 2 units spans pixels 23.3..38.3.
    expect(pixelBox({ left: 2, top: 2, width: 10, height: 10 }, { perUnit: 1.5, x: 20.3, y: 20.3, left: 0, top: 0 })).toEqual({ left: 3, top: 3, width: 15, height: 15 });
  });

  it("keeps a 1-unit edge at least one pixel thick at any scale", () => {
    for (const perUnit of [0.64, 1, 1.40625, 1.5]) {
      for (const x of [0, 0.25, 0.5, 0.75]) {
        const edge = pixelBox({ left: 7, top: 0, width: 1, height: 40 }, { perUnit, x, y: 0, left: 0, top: 0 });
        expect(edge.width, `${perUnit} px per unit at ${x}`).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(edge.left)).toBe(true);
      }
    }
  });

  it("leaves an empty box empty", () => {
    expect(pixelBox({ left: 3, top: 3, width: 0, height: 5 }, { perUnit: 1.5, x: 0, y: 0, left: 0, top: 0 }).width).toBe(0);
  });
});
