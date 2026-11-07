import { num } from "@/core";
/**
 * Dynamic group growth, ported from Musca Auras v1.15.0 `WeakAuras/RegionTypes/DynamicGroup.lua`.
 *
 * Positions are in the dynamic group's own units, y **up** (WoW), and say where each shown child's
 * `selfPoint` (the group's selfPoint) goes relative to the group's own selfPoint (DoPositionChildrenPerFrame,
 * DynamicGroup.lua:1458-1468; the child is anchored to its control point with the same point, :1191).
 * `null` means the child gets no position (past the limit) and is hidden (DoPositionChildren, :1569-1573).
 */

export interface GrowSettings {
  grow?: unknown;
  align?: unknown;
  space?: unknown;
  stagger?: unknown;
  useLimit?: unknown;
  limit?: unknown;
  radius?: unknown;
  rotation?: unknown;
  stepAngle?: unknown;
  fullCircle?: unknown;
  arcLength?: unknown;
  constantFactor?: unknown;
  gridType?: unknown;
  gridWidth?: unknown;
  rowSpace?: unknown;
  columnSpace?: unknown;
  centerType?: unknown;
}

export interface Size {
  width: number;
  height: number;
}

export type Position = [number, number] | null;


/** staggerCoefficient, DynamicGroup.lua:406-422. */
function staggerCoefficient(align: unknown, stagger: number): number {
  if (align === "LEFT") return stagger < 0 ? 1 : 0;
  if (align === "RIGHT") return stagger > 0 ? 1 : 0;
  return 0.5;
}

/** `data.useLimit and data.limit or math.huge`. */
function limitOf(d: GrowSettings): number {
  return d.useLimit === true ? num(d.limit, Infinity) : Infinity;
}

/** centeredIndexerStart / centeredIndexerNext, DynamicGroup.lua:483-550 (1-based indexes). */
const firstIndex: Record<string, (max: number) => number | null> = {
  LR: (m) => (m > 0 ? 1 : null),
  RL: (m) => (m > 0 ? m : null),
  CLR: (m) => (m >= 3 ? m - (m % 2) : m > 0 ? m : null),
  CRL: (m) => (m % 2 === 1 ? m : m > 0 ? m - 1 : null),
};
const nextIndex: Record<string, (i: number, max: number) => number | null> = {
  LR: (i, m) => (i + 1 <= m ? i + 1 : null),
  RL: (i) => (i - 1 > 0 ? i - 1 : null),
  CLR: (i, m) => {
    let n = i % 2 === 0 ? i - 2 : i + 2;
    if (i % 2 === 0 && n === 0) n = 1;
    return n > m ? null : n;
  },
  CRL: (i, m) => {
    let n = i % 2 === 1 ? i - 2 : i + 2;
    if (i % 2 === 1 && n === -1) n = 2;
    return n > m ? null : n;
  },
};

/** Lays out the shown children (in sort order) of a dynamic group. Unknown and CUSTOM growths fall back to DOWN. */
export function growPositions(d: GrowSettings, sizes: Size[]): Position[] {
  // `+ 0` turns the -0 that `-(n - 1) * stagger` gives into 0.
  return rawPositions(d, sizes).map((p) => p && [p[0] + 0, p[1] + 0]);
}

function rawPositions(d: GrowSettings, sizes: Size[]): Position[] {
  const out: Position[] = sizes.map(() => null);
  const n = sizes.length;
  const numVisible = Math.min(limitOf(d), n);
  const space = num(d.space, 0);
  const grow = typeof d.grow === "string" ? d.grow : "DOWN";

  switch (grow) {
    case "LEFT": {
      // DynamicGroup.lua:562-592
      const stagger = -num(d.stagger, 0);
      const coeff = staggerCoefficient(d.align, num(d.stagger, 0));
      let x = 0;
      let y = (numVisible - 1) * stagger * coeff;
      for (let i = 0; i < numVisible; i++) {
        out[i] = [x, y];
        x = x - sizes[i].width - space;
        y = y - stagger;
      }
      return out;
    }
    case "RIGHT": {
      // DynamicGroup.lua:593-623
      const stagger = num(d.stagger, 0);
      const coeff = 1 - staggerCoefficient(d.align, stagger);
      let x = 0;
      let y = -(numVisible - 1) * stagger * coeff;
      for (let i = 0; i < numVisible; i++) {
        out[i] = [x, y];
        x = x + sizes[i].width + space;
        y = y + stagger;
      }
      return out;
    }
    case "UP": {
      // DynamicGroup.lua:624-654
      const stagger = num(d.stagger, 0);
      const coeff = 1 - staggerCoefficient(d.align, stagger);
      let x = -(numVisible - 1) * stagger * coeff;
      let y = 0;
      for (let i = 0; i < numVisible; i++) {
        out[i] = [x, y];
        x = x + stagger;
        y = y + sizes[i].height + space;
      }
      return out;
    }
    case "HORIZONTAL":
    case "VERTICAL": {
      // DynamicGroup.lua:686-765
      const horizontal = grow === "HORIZONTAL";
      const stagger = horizontal ? num(d.stagger, 0) : -num(d.stagger, 0);
      const center = typeof d.centerType === "string" && d.centerType in firstIndex ? d.centerType : "LR";
      const dim = (i: number) => (horizontal ? sizes[i].width : sizes[i].height);
      let total = (numVisible - 1) * space;
      for (let i = 0; i < numVisible; i++) total += dim(i);
      let x = horizontal ? -total / 2 : -(stagger * (numVisible - 1)) / 2;
      let y = horizontal ? -(stagger * (numVisible - 1)) / 2 : -total / 2;
      let i = firstIndex[center](numVisible);
      while (i !== null) {
        const k = i - 1;
        if (horizontal) {
          x += dim(k) / 2;
          out[k] = [x, y];
          x += dim(k) / 2 + space;
          y += stagger;
        } else {
          y += dim(k) / 2;
          out[k] = [x, y];
          x += stagger;
          y += dim(k) / 2 + space;
        }
        i = nextIndex[center](i, numVisible);
      }
      return out;
    }
    case "CIRCLE":
    case "COUNTERCIRCLE": {
      // DynamicGroup.lua:766-873
      const counter = grow === "COUNTERCIRCLE";
      const constantFactor = d.constantFactor;
      const radius = num(d.radius, 0);
      const stepAngle = (num(d.stepAngle, 0) * Math.PI) / 180;
      const sAngle = (num(d.rotation, 0) * Math.PI) / 180;
      const full = d.fullCircle === true;
      const arc = ((full ? 360 : num(d.arcLength, 0)) * Math.PI) / 180;
      let r: number;
      if (constantFactor === "RADIUS" || constantFactor === "ANGLE") r = radius;
      else r = numVisible <= 1 ? 0 : (numVisible * space) / (2 * Math.PI);
      let dAngle: number;
      if (numVisible === 1) dAngle = 0;
      else if (constantFactor === "ANGLE") dAngle = counter ? -stepAngle : stepAngle;
      else if (!full) dAngle = counter ? arc / (1 - numVisible) : arc / (numVisible - 1);
      else dAngle = counter ? arc / -numVisible : arc / numVisible;
      let theta = sAngle;
      for (let i = 0; i < numVisible; i++) {
        out[i] = [r * Math.cos(theta), r * Math.sin(theta)];
        theta += dAngle;
      }
      return out;
    }
    case "GRID":
      return gridPositions(d, sizes, numVisible);
    case "DOWN":
    default: {
      // DynamicGroup.lua:655-685
      const stagger = num(d.stagger, 0);
      const coeff = staggerCoefficient(d.align, stagger);
      let x = -(numVisible - 1) * stagger * coeff;
      let y = 0;
      for (let i = 0; i < numVisible; i++) {
        out[i] = [x, y];
        x = x + stagger;
        y = y - sizes[i].height - space;
      }
      return out;
    }
  }
}

/** GRID, DynamicGroup.lua:874-1015. */
function gridPositions(d: GrowSettings, sizes: Size[], numVisible: number): Position[] {
  const gridType = typeof d.gridType === "string" ? d.gridType : "RD";
  const gridWidth = Math.max(1, num(d.gridWidth, 5));
  const rowFirst = /^[RLH]/.test(gridType);
  const rowMul = gridType.includes("D") ? -1 : 1;
  const colMul = gridType.includes("L") ? -1 : 1;
  const primaryHorizontal = gridType[0] === "H";
  const secondaryHorizontal = !primaryHorizontal && gridType[1] === "H";
  const primaryVertical = gridType[0] === "V";
  const secondaryVertical = !primaryVertical && gridType[1] === "V";
  type Axis = { dim: "width" | "height"; coord: 0 | 1; mul: number; space: number; current: number; max: number };
  let primary: Axis = { dim: "width", coord: 0, mul: colMul, space: num(d.columnSpace, 1), current: 0, max: 0 };
  let secondary: Axis = { dim: "height", coord: 1, mul: rowMul, space: num(d.rowSpace, 1), current: 0, max: 0 };
  if (!rowFirst) [primary, secondary] = [secondary, primary];

  const pos: [number, number][] = [];
  let minX: number | null = null;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  let start = 0;
  let totalMinX: number | null = null;
  let totalMaxX = 0;
  let totalMinY = 0;
  let totalMaxY = 0;
  for (let k = 0; k < numVisible; k++) {
    const i = k + 1; // Lua index, for `i % gridWidth`
    const p: [number, number] = [0, 0];
    p[primary.coord] = primary.current;
    p[secondary.coord] = secondary.current;
    pos[k] = p;
    const [x, y] = p;
    if (minX === null) {
      minX = maxX = x;
      minY = maxY = y;
      start = k;
    } else {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (totalMinX === null) {
      totalMinX = totalMaxX = x;
      totalMinY = totalMaxY = y;
    } else {
      totalMinX = Math.min(totalMinX, x);
      totalMaxX = Math.max(totalMaxX, x);
      totalMinY = Math.min(totalMinY, y);
      totalMaxY = Math.max(totalMaxY, y);
    }
    secondary.max = Math.max(secondary.max, sizes[k][secondary.dim]);
    if (i % gridWidth === 0) {
      if (primaryHorizontal) for (let j = start; j <= k; j++) pos[j][0] -= (maxX - minX) / 2;
      if (primaryVertical) for (let j = start; j <= k; j++) pos[j][1] -= (maxY - minY) / 2;
      primary.current = 0;
      secondary.current += (secondary.space + secondary.max) * secondary.mul;
      secondary.max = 0;
      minX = null;
    } else {
      primary.current += (primary.space + sizes[k][primary.dim]) * primary.mul;
    }
  }
  if ((primaryHorizontal || primaryVertical) && minX !== null) {
    for (let j = start; j < numVisible; j++) {
      if (primaryHorizontal) pos[j][0] -= (maxX - minX) / 2;
      if (primaryVertical) pos[j][1] -= (maxY - minY) / 2;
    }
  }
  if ((secondaryHorizontal || secondaryVertical) && totalMinX !== null) {
    for (let j = 0; j < numVisible; j++) {
      if (secondaryHorizontal) pos[j][0] -= (totalMaxX - totalMinX) / 2;
      if (secondaryVertical) pos[j][1] -= (totalMaxY - totalMinY) / 2;
    }
  }
  return sizes.map((_, k) => (k < numVisible ? pos[k] : null));
}

/**
 * The selfPoint the options give a dynamic group for its growth and alignment
 * (WeakAurasOptions/RegionOptions/DynamicGroup.lua:9-87); used when a document has none.
 */
export function dynamicSelfPoint(d: GrowSettings): string {
  const a = d.align;
  const pick = (left: string, right: string, center: string) => (a === "LEFT" ? left : a === "RIGHT" ? right : center);
  switch (d.grow) {
    case "RIGHT":
      return pick("TOPLEFT", "BOTTOMLEFT", "LEFT");
    case "LEFT":
      return pick("TOPRIGHT", "BOTTOMRIGHT", "RIGHT");
    case "UP":
      return pick("BOTTOMLEFT", "BOTTOMRIGHT", "BOTTOM");
    case "DOWN":
      return pick("TOPLEFT", "TOPRIGHT", "TOP");
    case "HORIZONTAL":
      return pick("TOP", "BOTTOM", "CENTER");
    case "VERTICAL":
      return pick("LEFT", "RIGHT", "CENTER");
    case "GRID": {
      const grid: Record<string, string> = {
        RU: "BOTTOMLEFT", UR: "BOTTOMLEFT", LU: "BOTTOMRIGHT", UL: "BOTTOMRIGHT",
        RD: "TOPLEFT", DR: "TOPLEFT", LD: "TOPRIGHT", DL: "TOPRIGHT",
        HD: "TOP", HU: "BOTTOM", VR: "LEFT", VL: "RIGHT",
        DH: "TOP", UH: "BOTTOM", LV: "RIGHT", RV: "LEFT", HV: "CENTER", VH: "CENTER",
      };
      return (typeof d.gridType === "string" && grid[d.gridType]) || "TOPLEFT";
    }
    default:
      return "CENTER";
  }
}
