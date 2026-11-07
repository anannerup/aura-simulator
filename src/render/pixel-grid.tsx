import { createContext, useContext, type ReactNode } from "react";
import type { Box } from "./screen/geometry";

/**
 * Where a frame's UI units fall on the screen's pixels: `perUnit` pixels per unit, the pixel position of the frame's
 * top left corner (`x`, `y`), and that corner in units from the surface's (`left`, `top`: the element whose CSS
 * transform scales units to pixels). The game screen and the render page draw in UI units under a CSS scale, so a unit
 * edge rarely lands on a whole pixel; the game snaps its textures to the pixel grid instead.
 */
export interface PixelGrid {
  perUnit: number;
  x: number;
  y: number;
  left: number;
  top: number;
}

/** A surface's grid: its corner on pixel (`x`, `y`), `perUnit` pixels per unit. */
export const surfaceGrid = (perUnit: number, x = 0, y = 0): PixelGrid => ({ perUnit, x, y, left: 0, top: 0 });

/**
 * The pixel grid under the frame being drawn: UIParent's from the surface (`GameScreen`, the render page: its corner
 * on a whole pixel), each region's from `AuraRegion` (`frameGrid`). Null where it isn't known (a thumbnail): nothing
 * is snapped there.
 */
export const PixelGridContext = createContext<PixelGrid | null>(null);

export const usePixelGrid = (): PixelGrid | null => useContext(PixelGridContext);

/** The grid under a child frame whose top left corner is at (`left`, `top`) units in `grid`'s frame. */
export function frameGrid(grid: PixelGrid, left: number, top: number): PixelGrid {
  const { perUnit } = grid;
  return { perUnit, x: grid.x + left * perUnit, y: grid.y + top * perUnit, left: grid.left + left, top: grid.top + top };
}

/** One side of a box in pixels from the pixel the frame starts in: edges rounded, at least one pixel apart. */
function snapSpan(start: number, size: number, perUnit: number, origin: number): [number, number] {
  const corner = Math.floor(origin);
  if (size <= 0) return [Math.round(origin + start * perUnit) - corner, 0];
  const from = Math.round(origin + start * perUnit);
  const to = Math.max(from + 1, Math.round(origin + (start + size) * perUnit));
  return [from - corner, to - from];
}

/**
 * A box (in units, relative to the grid's frame) as the game draws a texture snapped to the pixel grid: in whole
 * pixels, relative to the pixel the frame's corner is in (`PixelSpace`'s origin). Each edge is rounded to the nearest
 * pixel and a box that isn't empty is at least one pixel across, so a 1-unit border edge shows at any scale.
 */
export function pixelBox(box: Box, grid: PixelGrid): Box {
  const [left, width] = snapSpan(box.left, box.width, grid.perUnit, grid.x);
  const [top, height] = snapSpan(box.top, box.height, grid.perUnit, grid.y);
  return { left, top, width, height };
}

/**
 * A layer inside a frame whose CSS pixels are the screen's pixels: it starts at the whole pixel the frame's corner is
 * in and undoes the units' scale, so children placed by `pixelBox` are drawn on whole pixels. The browser rounds where
 * a transformed element sits to whole units of its surface (at 1.5 pixels per unit, up to ¾ pixel off), so the layer
 * sits on a whole unit and its transform moves it the rest of the way.
 */
export function PixelSpace({ grid, children }: { grid: PixelGrid; children: ReactNode }) {
  const { perUnit, x, y, left, top } = grid;
  const [ux, uy] = [Math.round(left) - left, Math.round(top) - top];
  const dx = (Math.floor(x) - (x + ux * perUnit)) / perUnit;
  const dy = (Math.floor(y) - (y + uy * perUnit)) / perUnit;
  return (
    <div
      style={{
        position: "absolute",
        left: ux,
        top: uy,
        transform: `translate(${dx}px, ${dy}px) scale(${1 / perUnit})`,
        transformOrigin: "0 0",
      }}
      data-pixel-space
    >
      {children}
    </div>
  );
}
