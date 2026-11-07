/**
 * Aura bar maths (RegionTypes/AuraBar.lua, SubRegionTypes/Tick.lua), pure and in CSS coordinates: y down,
 * rects relative to the region's top left. WoW offsets are y up and are flipped here.
 */
import type { LuaValue } from "@/core";
import type { Box } from "./screen/geometry";

export type Orientation = "HORIZONTAL" | "HORIZONTAL_INVERSE" | "VERTICAL" | "VERTICAL_INVERSE";


export function orientationOf(value: LuaValue | undefined): Orientation {
  return value === "HORIZONTAL_INVERSE" || value === "VERTICAL" || value === "VERTICAL_INVERSE" ? value : "HORIZONTAL";
}

const isVertical = (o: Orientation) => o === "VERTICAL" || o === "VERTICAL_INVERSE";

/**
 * Icon and bar rects (AuraBar.lua:690-800 orientHorizontal/orientVertical...). The icon is a square of
 * min(width, height) (:1068, :1396); `icon_side` LEFT puts it left (horizontal) or on top (vertical), RIGHT
 * right or at the bottom. The bar fills the rest; its TOPLEFT/TOPRIGHT point sits on the icon's corner.
 */
export function barLayout(o: {
  width: number;
  height: number;
  orientation: Orientation;
  icon: boolean;
  iconSide: "LEFT" | "RIGHT";
}): { bar: Box; icon?: Box } {
  const { width: w, height: h } = o;
  if (!o.icon) return { bar: { left: 0, top: 0, width: w, height: h } };
  const s = Math.min(w, h);
  if (!isVertical(o.orientation)) {
    const top = (h - s) / 2;
    if (o.iconSide === "LEFT") {
      return { icon: { left: 0, top, width: s, height: s }, bar: { left: s, top, width: w - s, height: h - top } };
    }
    return { icon: { left: w - s, top, width: s, height: s }, bar: { left: 0, top, width: w - s, height: h - top } };
  }
  const left = (w - s) / 2;
  if (o.iconSide === "LEFT") {
    return { icon: { left, top: 0, width: s, height: s }, bar: { left, top: s, width: w - left, height: h - s } };
  }
  return { icon: { left, top: h - s, width: s, height: s }, bar: { left, top: 0, width: w - left, height: h - s } };
}

/** `adjustedMin`/`adjustedMax`: a number of seconds, or "N%" of the duration (RegionPrototype AddProgressSourceToDefault). */
function adjusted(value: LuaValue | undefined, duration: number): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const s = value.trim();
  if (s.endsWith("%")) {
    const p = Number(s.slice(0, -1));
    return Number.isFinite(p) ? (p / 100) * duration : undefined;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export interface BarProgress {
  /** Fill share 0..1 after `inverse`. */
  progress: number;
  /** GetMinMaxProgress (ticks). */
  min: number;
  max: number;
}

/**
 * Bar fill from a timer (RegionPrototype.lua:545-600 UpdateProgressFromState "timer", AuraBar.lua:957-980
 * UpdateTime/SetProgress): progress = (remaining - min) / (max - min), 0 without a duration or state, then
 * `1 - progress` when the aura's Inverse is on. Clamped to the bar's 0..1 (AuraBar.lua:340-343).
 * The Aura (Modern) "missing" button empties its bars (SecretAuraSingleFollow.lua:106-117 ResetBars).
 */
export function barProgress(o: {
  remaining?: number;
  duration: number;
  inverse: boolean;
  missing?: boolean;
  adjustedMin?: LuaValue;
  adjustedMax?: LuaValue;
}): BarProgress {
  if (o.missing) return { progress: 0, min: 0, max: 0 };
  const duration = o.remaining === undefined ? 0 : o.duration;
  const min = adjusted(o.adjustedMin, duration) ?? 0;
  const max = duration === 0 ? 0 : (adjusted(o.adjustedMax, duration) ?? duration);
  const span = max - min;
  let progress = span !== 0 && o.remaining !== undefined ? (o.remaining - min) / span : 0;
  if (o.inverse) progress = 1 - progress;
  return { progress: Math.min(1, Math.max(0, progress)), min, max };
}

/**
 * The foreground (fgMask) rect inside the bar (AuraBar.lua:263-275 anchorAlignment, :345-366 UpdateProgress):
 * HORIZONTAL grows from the left, HORIZONTAL_INVERSE from the right, VERTICAL from the top, VERTICAL_INVERSE
 * from the bottom. The game hides the texture at <= 0.0001 and pads the mask by 0.1.
 */
export function foregroundBox(bar: Box, orientation: Orientation, progress: number): Box | null {
  if (!isVertical(orientation)) {
    const w = bar.width * progress;
    if (w <= 0.0001) return null;
    return { left: orientation === "HORIZONTAL" ? bar.left : bar.left + bar.width - w, top: bar.top, width: w, height: bar.height };
  }
  const h = bar.height * progress;
  if (h <= 0.0001) return null;
  return { left: bar.left, top: orientation === "VERTICAL" ? bar.top : bar.top + bar.height - h, width: bar.width, height: h };
}

/** The spark's centre: the fgMask's growing edge (anchorAlignment third point), plus its offsets (AuraBar.lua:295). */
export function sparkCenter(bar: Box, orientation: Orientation, progress: number, offsetX = 0, offsetY = 0): { x: number; y: number } {
  let x: number;
  let y: number;
  switch (orientation) {
    case "HORIZONTAL":
      x = bar.left + bar.width * progress;
      y = bar.top + bar.height / 2;
      break;
    case "HORIZONTAL_INVERSE":
      x = bar.left + bar.width * (1 - progress);
      y = bar.top + bar.height / 2;
      break;
    case "VERTICAL":
      x = bar.left + bar.width / 2;
      y = bar.top + bar.height * progress;
      break;
    default:
      x = bar.left + bar.width / 2;
      y = bar.top + bar.height * (1 - progress);
  }
  return { x: x + offsetX, y: y - offsetY };
}

/** AuraBar.lua:368-377: spark visibility; `spark` off means "ALWAYS" hidden (:1356). */
export function sparkVisible(spark: boolean, sparkHidden: LuaValue | undefined, progress: number): boolean {
  if (!spark) return false;
  switch (sparkHidden ?? "NEVER") {
    case "NEVER":
      return true;
    case "FULL":
      return progress < 1;
    case "EMPTY":
      return progress > 0;
    case "BOTH":
      return progress < 1 && progress > 0;
    default:
      return false;
  }
}

/**
 * How the bar texture is turned (AuraBar.lua:238-262 GetTexCoordFunctions with SetRotatesTexture(true)):
 * HORIZONTAL as is, HORIZONTAL_INVERSE mirrored, VERTICAL turned 90° clockwise, VERTICAL_INVERSE 90° anticlockwise.
 */
export interface TextureTurn {
  rotate: 0 | 90 | -90 | 180 | 270;
  mirror: boolean;
}

export function barTextureTurn(orientation: Orientation): TextureTurn {
  switch (orientation) {
    case "HORIZONTAL_INVERSE":
      return { rotate: 0, mirror: true };
    case "VERTICAL":
      return { rotate: 90, mirror: false };
    case "VERTICAL_INVERSE":
      return { rotate: -90, mirror: false };
    default:
      return { rotate: 0, mirror: false };
  }
}

/**
 * Spark texture turn. AUTO follows the bar; otherwise GetTexCoordSpark(degree, mirror) (AuraBar.lua:218-236)
 * turns the texture anticlockwise by `sparkRotation` (0/90/180/270) and mirrors it horizontally.
 */
export function sparkTextureTurn(orientation: Orientation, mode: LuaValue | undefined, rotation: LuaValue | undefined, mirror: boolean): TextureTurn {
  if ((mode ?? "AUTO") === "AUTO") return barTextureTurn(orientation);
  const deg = Number(rotation ?? 0);
  const steps = Number.isFinite(deg) ? (((Math.round(deg / 90) % 4) + 4) % 4) : 0;
  const rotate = ([0, -90, 180, 90] as const)[steps];
  return { rotate, mirror };
}

export type TickMode = "AtValue" | "AtMissingValue" | "AtPercent" | "ValueOffset";

export interface Tick {
  /** Centre in the bar's coordinates (CSS px from the bar's top left). */
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

/**
 * Tick placement (Tick.lua:285-345 UpdateTickPlacementOne, :365-385 UpdateTickSize). A tick at value v sits at
 * (v - min) / (max - min) of the bar's length, measured from the side the bar grows from (LEFT/RIGHT/TOP/BOTTOM,
 * Tick.lua:76-88), or from the other side when the aura's Inverse is on. Out-of-range ticks are hidden.
 * Thickness runs along the bar, length across it (the bar's thickness when automatic).
 */
export function tickPlacement(o: {
  mode: TickMode;
  placement: number;
  min: number;
  max: number;
  /** Timer seconds left, for ValueOffset. */
  remaining?: number;
  orientation: Orientation;
  inverse: boolean;
  barWidth: number;
  barHeight: number;
  thickness: number;
  length: number;
  automaticLength: boolean;
  xOffset: number;
  yOffset: number;
}): Tick {
  const range = o.max - o.min;
  let value: number | undefined;
  switch (o.mode) {
    case "AtMissingValue":
      value = o.max - o.placement;
      break;
    case "AtPercent":
      value = o.placement >= 0 && o.placement <= 100 ? o.min + (o.placement * range) / 100 : undefined;
      break;
    case "ValueOffset":
      value = o.max !== 0 && o.remaining !== undefined ? o.remaining + o.placement : undefined;
      break;
    default:
      value = o.placement;
  }
  const percent = range !== 0 && value !== undefined ? (value - o.min) / range : undefined;
  const visible = percent !== undefined && percent >= 0 && percent <= 1;
  const vertical = isVertical(o.orientation);
  const major = vertical ? o.barHeight : o.barWidth;
  const minor = vertical ? o.barWidth : o.barHeight;
  const distance = visible ? percent * major : 0;
  // The side the bar grows from: LEFT, RIGHT, TOP, BOTTOM for the four orientations.
  const fromStart = o.orientation === "HORIZONTAL" || o.orientation === "VERTICAL";
  const startSide = o.inverse ? !fromStart : fromStart;
  const along = startSide ? distance : major - distance;
  const length = o.automaticLength ? minor : o.length;
  return vertical
    ? { x: o.barWidth / 2 + o.xOffset, y: along - o.yOffset, width: length, height: o.thickness, visible }
    : { x: along + o.xOffset, y: o.barHeight / 2 - o.yOffset, width: o.thickness, height: length, visible };
}
