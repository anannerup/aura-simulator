/**
 * Glow sub-region options (WeakAuras/SubRegionTypes/Glow.lua) and how they map to the
 * LibCustomGlow-1.0 start calls, including LibCustomGlow's own fallbacks.
 */

import type { Rgba } from "../color";

export type GlowType = "buttonOverlay" | "Pixel" | "ACShine" | "Proc";

/** The glow sub-region's fields, named as in the aura document. */
export interface GlowOptions {
  useGlowColor: boolean;
  glowColor: Rgba;
  glowLines: number;
  glowFrequency: number;
  glowDuration: number;
  glowLength: number;
  glowThickness: number;
  glowScale: number;
  glowBorder: boolean;
  glowXOffset: number;
  glowYOffset: number;
  /** Proc only; absent in the defaults, so it is off unless set. */
  glowStartAnim?: boolean;
}

/** Glow.lua `default()` (glow=false and glowType are separate props on the component). */
export const GLOW_DEFAULTS: GlowOptions = {
  useGlowColor: false,
  glowColor: [1, 1, 1, 1],
  glowLines: 8,
  glowFrequency: 0.25,
  glowDuration: 1,
  glowLength: 10,
  glowThickness: 1,
  glowScale: 1,
  glowBorder: false,
  glowXOffset: 0,
  glowYOffset: 0,
};

/** LibCustomGlow's colour when none is passed (Pixel and Autocast). */
export const LCG_DEFAULT_COLOR: Rgba = [0.95, 0.95, 0.32, 1];

export interface ButtonGlowParams {
  type: "buttonOverlay";
  /** null: untinted, not desaturated, alpha 1. */
  color: Rgba | null;
  /** Seconds per ants flipbook step (AnimateTexCoords throttle). */
  throttle: number;
}

export interface PixelGlowParams {
  type: "Pixel";
  color: Rgba;
  lines: number;
  /** Seconds per lap; negative runs backwards. */
  period: number;
  length: number;
  thickness: number;
  xOffset: number;
  yOffset: number;
  border: boolean;
}

export interface AutoCastParams {
  type: "ACShine";
  color: Rgba;
  /** Particles per ring (four rings). */
  particles: number;
  period: number;
  scale: number;
  xOffset: number;
  yOffset: number;
}

export interface ProcGlowParams {
  type: "Proc";
  color: Rgba | null;
  startAnim: boolean;
  /** Loop flipbook duration in seconds. */
  duration: number;
  xOffset: number;
  yOffset: number;
}

export type GlowParams = ButtonGlowParams | PixelGlowParams | AutoCastParams | ProcGlowParams;

function lcgPeriod(frequency: number | undefined, fallback: number): number {
  if (frequency === undefined || frequency === null) return fallback;
  if (!(frequency > 0 || frequency < 0)) return fallback; // 0 or NaN
  return 1 / frequency;
}

/**
 * Translates glow options into LibCustomGlow parameters for a parent of `width`×`height`
 * (Glow.lua `glowStart` followed by the *_Start functions' defaulting).
 */
export function glowParams(type: GlowType, partial: Partial<GlowOptions>, width: number, height: number): GlowParams {
  const o = { ...GLOW_DEFAULTS, ...partial };
  const color: Rgba | null = o.useGlowColor ? o.glowColor : null;

  switch (type) {
    case "buttonOverlay": {
      const f = o.glowFrequency;
      return { type, color, throttle: f && f > 0 ? (0.25 / f) * 0.01 : 0.01 };
    }
    case "Pixel": {
      const lines = o.glowLines > 0 ? o.glowLines : 8;
      let length = o.glowLength ?? Math.floor((width + height) * (2 / lines - 0.1));
      length = Math.min(length, Math.min(width, height));
      return {
        type,
        color: color ?? LCG_DEFAULT_COLOR,
        lines,
        period: lcgPeriod(o.glowFrequency, 4),
        length,
        thickness: o.glowThickness ?? 1,
        xOffset: o.glowXOffset ?? 0,
        yOffset: o.glowYOffset ?? 0,
        border: o.glowBorder !== false,
      };
    }
    case "ACShine":
      return {
        type,
        color: color ?? LCG_DEFAULT_COLOR,
        particles: o.glowLines > 0 ? o.glowLines : 4,
        period: lcgPeriod(o.glowFrequency, 8),
        scale: o.glowScale ?? 1,
        xOffset: o.glowXOffset ?? 0,
        yOffset: o.glowYOffset ?? 0,
      };
    case "Proc":
      return {
        type,
        color,
        startAnim: !!o.glowStartAnim,
        duration: o.glowDuration ?? 1,
        xOffset: o.glowXOffset ?? 0,
        yOffset: o.glowYOffset ?? 0,
      };
  }
}

/**
 * Glow.lua anchors buttonOverlay and Proc to the whole region and Pixel/ACShine to the icon
 * area; for an icon region without inset both are the icon rect, so the renderer takes the
 * rect it is given. Glow.lua also skips the glow when that rect is under 1×1.
 */
export function glowDrawable(width: number, height: number): boolean {
  return width >= 1 && height >= 1;
}

/**
 * The frame addFrameAndTex creates for Pixel and Autocast glows, relative to the parent's
 * top-left in CSS pixels (y down). The 0.05 nudges are in the Lua.
 */
export function offsetFrameRect(width: number, height: number, xOffset: number, yOffset: number) {
  const left = -xOffset + 0.05;
  const top = -(yOffset + 0.05);
  const right = width + xOffset;
  const bottom = height + yOffset - 0.05;
  return { left, top, width: right - left, height: bottom - top };
}
