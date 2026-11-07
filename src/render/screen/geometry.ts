/**
 * Mock game screen geometry, in WoW UI units.
 *
 * WoW's UI coordinate system is 768 units high at scale 1, whatever the window size; the width follows the window's
 * aspect ratio. UIParent has the UI scale, so it is 768 / uiScale units high, and one of its units is
 * windowHeight / 768 * uiScale physical pixels. ElvUI (PixelPerfect.lua) relies on the same model: `768 /
 * physicalHeight` is its "pixel perfect" scale, at which one UIParent unit is one pixel, and GetScreenHeight() is
 * UIParent's height in its own units. With "Use UI Scale" off, UIParent keeps scale 1.
 *
 * All positions here are y-down from UIParent's top left; WoW offsets are y-up and are flipped in `placeRegion`.
 */
import type { ScreenSettings } from "./settings";

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
function placeRegion(
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

/** A rect scaled by (sx, sy) about its `selfPoint` (the point the region is pinned by), then moved by (dx, dy) (y up). */
export function animatedRect(rect: Box, selfPoint: unknown, sx: number, sy: number, dx: number, dy: number): Box {
  const [fx, fy] = anchorFraction(selfPoint);
  const width = rect.width * Math.abs(sx);
  const height = rect.height * Math.abs(sy);
  return { left: rect.left + rect.width * fx - width * fx + dx, top: rect.top + rect.height * fy - height * fy - dy, width, height };
}

/** The height of the UI coordinate system at scale 1. */
export const UI_BASE_HEIGHT = 768;

/** A rectangle in CSS terms (y down from the top left), so it can be spread into a style. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface UiParent {
  /** UIParent's size in its own units (GetScreenWidth/GetScreenHeight). */
  width: number;
  height: number;
  /** UIParent's effective scale. */
  scale: number;
  /** Physical window pixels per UIParent unit. */
  pixelsPerUnit: number;
}

export function uiParent(settings: Pick<ScreenSettings, "width" | "height" | "useUiScale" | "uiScale">): UiParent {
  const scale = settings.useUiScale ? settings.uiScale : 1;
  const height = UI_BASE_HEIGHT / scale;
  return {
    width: (height * settings.width) / settings.height,
    height,
    scale,
    pixelsPerUnit: (settings.height / UI_BASE_HEIGHT) * scale,
  };
}

/** CSS pixels per window pixel to fit the whole window, aspect kept, into the available browser area. */
export function fitScale(window: { width: number; height: number }, available: { width: number; height: number }) {
  return Math.max(0, Math.min(available.width / window.width, available.height / window.height));
}

/** The frame an aura is anchored to: UIParent itself, or a stand-in for a frame the simulator does not draw. */
export interface AnchorFrame {
  rect: Box;
  /** The anchor point WeakAuras really uses (MOUSE always anchors to the cursor's CENTER). */
  anchorPoint: unknown;
  /** Set for stand-ins: what the box stands for. */
  label?: string;
}

/**
 * Where an aura's anchor frame is (WeakAuras.lua GetAnchorFrame and Private.AnchorFrame):
 * - SCREEN ("Screen/Parent Group") anchors to its parent; a top-level aura's parent is WeakAurasFrame, which is
 *   SetAllPoints(UIParent), so it is UIParent's rect. UIPARENT ("Screen") anchors to UIParent itself.
 * - PRD, NAMEPLATE, UNITFRAME, MOUSE, SELECTFRAME and CUSTOM anchor to frames the game creates; these get a stand-in
 *   at a typical spot. MOUSE forces anchorPoint CENTER.
 */
export function anchorFrameFor(
  aura: { anchorFrameType?: unknown; anchorPoint?: unknown; anchorFrameFrame?: unknown },
  ui: UiParent,
): AnchorFrame {
  const screen = { left: 0, top: 0, width: ui.width, height: ui.height };
  const centredAt = (cx: number, cy: number, width: number, height: number): Box => ({
    left: cx - width / 2,
    top: cy - height / 2,
    width,
    height,
  });
  // Frames whose effective scale is 1 whatever the UI scale (the PRD stand-in, nameplates) are 1/scale UIParent units.
  const unscaled = 1 / ui.scale;
  switch (aura.anchorFrameType) {
    case undefined:
    case "SCREEN":
    case "UIPARENT":
      return { rect: screen, anchorPoint: aura.anchorPoint };
    case "PRD": {
      // WeakAuras' PRD mover with default nameplate CVars: 200 * 1.1 - 24 wide, 4 * 1.2 * 2 + 1 high, scale 1.
      return {
        rect: centredAt(ui.width / 2, ui.height * 0.62, 196 * unscaled, 10.6 * unscaled),
        anchorPoint: aura.anchorPoint,
        label: "Personal Resource Display",
      };
    }
    case "NAMEPLATE":
      return {
        rect: centredAt(ui.width / 2, ui.height * 0.3, 196 * unscaled, 10.6 * unscaled),
        anchorPoint: aura.anchorPoint,
        label: "Nameplate",
      };
    case "UNITFRAME":
      // Blizzard's PlayerFrame: 232x100 at TOPLEFT (-19, -4) of UIParent; its art starts about 19 units in.
      return { rect: { left: 0, top: 4, width: 232, height: 100 }, anchorPoint: aura.anchorPoint, label: "Unit frame" };
    case "MOUSE":
      return { rect: centredAt(ui.width * 0.6, ui.height * 0.45, 0, 0), anchorPoint: "CENTER", label: "Mouse cursor" };
    case "SELECTFRAME": {
      const name = typeof aura.anchorFrameFrame === "string" ? aura.anchorFrameFrame : "";
      return {
        rect: centredAt(ui.width / 2, ui.height / 2, 100, 100),
        anchorPoint: aura.anchorPoint,
        label: name ? `Frame: ${name}` : "Selected frame",
      };
    }
    default:
      return {
        rect: centredAt(ui.width / 2, ui.height / 2, 100, 100),
        anchorPoint: aura.anchorPoint,
        label: "Custom anchor",
      };
  }
}

/** An aura's rect in UIParent units: its selfPoint pinned on its anchor frame's anchorPoint, plus offsets. */
export function placeAura(
  aura: {
    anchorFrameType?: unknown;
    anchorFrameFrame?: unknown;
    anchorPoint?: unknown;
    selfPoint?: unknown;
    xOffset: number;
    yOffset: number;
    width: number;
    height: number;
  },
  ui: UiParent,
): { rect: Box; frame: AnchorFrame } {
  const frame = anchorFrameFor(aura, ui);
  const { left, top } = placeRegion(frame.rect, { ...aura, selfPoint: aura.selfPoint, anchorPoint: frame.anchorPoint });
  return { rect: { left: frame.rect.left + left, top: frame.rect.top + top, width: aura.width, height: aura.height }, frame };
}

/** A rect in UIParent units as physical window pixels. */
export function toPixels(rect: Box, ui: UiParent): Box {
  const k = ui.pixelsPerUnit;
  return { left: rect.left * k, top: rect.top * k, width: rect.width * k, height: rect.height * k };
}

/** Frame strata (Types.lua frame_strata_types; 1 = inherited) as a CSS z-index. */
export function strataZIndex(frameStrata: unknown): number {
  return typeof frameStrata === "number" && frameStrata >= 2 && frameStrata <= 9 ? frameStrata : 4;
}

