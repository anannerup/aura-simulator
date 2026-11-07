/**
 * What a sub-region needs from the region it sits on: where its anchors are. Each region type answers like its
 * `AnchorSubRegion` in the addon (RegionPrototype.lua:804-823, Icon.lua:165-210, AuraBar.lua:878-940).
 */
import type { LuaValue } from "@/core";
import type { Orientation } from "../bar-geometry";
import type { Box } from "../screen/geometry";
import { anchorFraction } from "../screen/geometry";

export interface PointAnchor {
  /** The frame the text is pinned to. */
  box: Box;
  /** The point on that frame. */
  point: string;
  /** Extra offset (WoW units, y up), e.g. the bar's INNER_ inset. */
  dx: number;
  dy: number;
}

export interface BarInfo {
  bar: Box;
  orientation: Orientation;
  /** The aura's Inverse setting (Tick.lua `inverse_direction`). */
  inverse: boolean;
  /** GetMinMaxProgress. */
  min: number;
  max: number;
  /** Seconds left on the timer, if one runs. */
  remaining?: number;
}

export interface SubRegionHost {
  regionType: string;
  width: number;
  height: number;
  /** "area" anchoring (borders, glows): the box for an `anchor_area` (or the parent's default for undefined). */
  area(anchorArea: LuaValue | undefined, use: "border" | "glow"): Box;
  /** "point" anchoring (texts). */
  point(anchorPoint: string): PointAnchor;
  /** Aura bars only: what ticks are placed on. */
  bar?: BarInfo;
}

/** Where a point anchor puts a sub-element's own point, moved by (x, y) (WoW units, y up). */
export function anchorPosition(anchor: PointAnchor, x: number, y: number): { left: number; top: number } {
  const [ax, ay] = anchorFraction(anchor.point);
  return { left: anchor.box.left + anchor.box.width * ax + x + anchor.dx, top: anchor.box.top + anchor.box.height * ay - y - anchor.dy };
}

export const fullBox = (width: number, height: number): Box => ({ left: 0, top: 0, width, height });

/** Grows a box by `n` on each side (negative shrinks), as SetPoint(bottomleft, -n, -n) + (topright, n, n). */
export function inflate(box: Box, n: number): Box {
  return { left: box.left - n, top: box.top - n, width: box.width + 2 * n, height: box.height + 2 * n };
}

/** The icon's anchors (Icon.lua:165-210): INNER_ points sit on a box 80% of the icon, OUTER_ on 110% (Icon.lua:220-241). */
export function iconHost(width: number, height: number): SubRegionHost {
  const region = fullBox(width, height);
  return {
    regionType: "icon",
    width,
    height,
    area: () => region,
    point(anchorPoint) {
      if (anchorPoint.startsWith("INNER_")) {
        return { box: { left: 0.1 * width, top: 0.1 * height, width: 0.8 * width, height: 0.8 * height }, point: anchorPoint.slice(6), dx: 0, dy: 0 };
      }
      if (anchorPoint.startsWith("OUTER_")) {
        return { box: { left: -0.05 * width, top: -0.05 * height, width: 1.1 * width, height: 1.1 * height }, point: anchorPoint.slice(6), dx: 0, dy: 0 };
      }
      return { box: region, point: anchorPoint, dx: 0, dy: 0 };
    },
  };
}

/**
 * Regions without special anchors (texture, progress texture, stop motion, model, empty: RegionPrototype.lua:804-823
 * AnchorSubRegion): areas are the whole region, points are the region's points.
 */
export function regionHost(regionType: string, width: number, height: number): SubRegionHost {
  const region = fullBox(width, height);
  return {
    regionType,
    width,
    height,
    area: () => region,
    point: (anchorPoint) => ({ box: region, point: anchorPoint, dx: 0, dy: 0 }),
  };
}
