/** WoW anchor points: where a region's selfPoint is pinned onto its parent's anchorPoint. */

const POINTS: Record<string, [number, number]> = {
  TOPLEFT: [0, 0],
  TOP: [0.5, 0],
  TOPRIGHT: [1, 0],
  LEFT: [0, 0.5],
  CENTER: [0.5, 0.5],
  RIGHT: [1, 0.5],
  BOTTOMLEFT: [0, 1],
  BOTTOM: [0.5, 1],
  BOTTOMRIGHT: [1, 1],
};

/** Fraction of width/height (from the top left) of a named anchor point; unknown names mean CENTER. */
export function anchorFraction(point: unknown): [number, number] {
  return (typeof point === "string" && POINTS[point]) || POINTS.CENTER;
}

/**
 * Top-left position (CSS pixels, y down) of a region inside its parent.
 * WoW offsets are y-up, so a positive yOffset moves the region up.
 */
export function placeRegion(
  parent: { width: number; height: number },
  region: { width: number; height: number; anchorPoint: unknown; selfPoint: unknown; xOffset: number; yOffset: number },
): { left: number; top: number } {
  const [ax, ay] = anchorFraction(region.anchorPoint);
  const [sx, sy] = anchorFraction(region.selfPoint);
  return {
    left: parent.width * ax + region.xOffset - region.width * sx,
    top: parent.height * ay - region.yOffset - region.height * sy,
  };
}
