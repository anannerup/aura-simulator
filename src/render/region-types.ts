/**
 * What the renderers know per region type, in one table: sizing, what animations may do and tint, and what the
 * sub-elements on it default to, and the props every region component takes. Pure (no React), so layout code can
 * read it; `regions.tsx` maps each type to its component.
 */
import type { AuraDocument, AuraRenderState } from "@/core";
import type { GlowType } from "./glow";

export interface RegionTypeInfo {
  /**
   * Sized by its content (text): placed by its `selfPoint` on the anchor, not by the document's width and height.
   */
  autoSize: boolean;
  /** The property a colour animation tints (the region's Color/ColorAnim target). */
  colorProperty: string;
  /** What animations may do to it (RegionTypes/*.lua: Scale, SetAnimRotation, ColorAnim). */
  caps: { scale: boolean; rotate: boolean; color: boolean };
  /** SubText.lua:16-67: a text element's defaults on this parent. */
  subText: { fontType: string; shadowX: number; shadowY: number; anchor: string };
  /** SubText.lua:510-538 resolveSelfPoint: the point an AUTO text pins to its anchor point. */
  autoSelfPoint(anchorPoint: string): string;
  /** Glow.lua:12-32: the glow type a glow element without one draws. */
  glowType: GlowType;
  /** Carries the bar and icon frames on a `subforeground` entry (Background.lua:33-59). */
  foreground: boolean;
}

/** Private.inverse_point_types (Types.lua:1457). */
const INVERSE_POINTS: Record<string, string> = {
  TOPLEFT: "BOTTOMRIGHT",
  TOP: "BOTTOM",
  TOPRIGHT: "BOTTOMLEFT",
  LEFT: "RIGHT",
  CENTER: "CENTER",
  RIGHT: "LEFT",
  BOTTOMLEFT: "TOPRIGHT",
  BOTTOM: "TOP",
  BOTTOMRIGHT: "TOPLEFT",
};

const PLAIN: RegionTypeInfo = {
  autoSize: false,
  colorProperty: "color",
  caps: { scale: false, rotate: false, color: false },
  subText: { fontType: "None", shadowX: 1, shadowY: -1, anchor: "BOTTOMLEFT" },
  autoSelfPoint: (anchorPoint) => INVERSE_POINTS[anchorPoint] ?? "CENTER",
  glowType: "buttonOverlay",
  foreground: false,
};

const SCALE_COLOR = { scale: true, rotate: false, color: true };
const type = (overrides: Partial<RegionTypeInfo>): RegionTypeInfo => ({ ...PLAIN, ...overrides });

export const REGION_TYPES = {
  icon: type({
    caps: SCALE_COLOR,
    subText: { fontType: "OUTLINE", shadowX: 0, shadowY: 0, anchor: "CENTER" },
    autoSelfPoint(p) {
      if (p.startsWith("INNER_")) return p.slice(6);
      if (p.startsWith("OUTER_")) return INVERSE_POINTS[p.slice(6)] ?? "CENTER";
      return "CENTER";
    },
  }),
  aurabar: type({
    colorProperty: "barColor",
    caps: SCALE_COLOR,
    subText: { ...PLAIN.subText, anchor: "INNER_RIGHT" },
    autoSelfPoint: (p) => p.replace(/^(ICON_|INNER_)/, ""),
    glowType: "Pixel",
    foreground: true,
  }),
  text: type({ autoSize: true, caps: { scale: false, rotate: false, color: true } }),
  texture: type({ caps: { scale: true, rotate: true, color: true } }),
  progresstexture: type({ colorProperty: "foregroundColor", caps: { scale: true, rotate: true, color: true } }),
  stopmotion: type({ colorProperty: "foregroundColor", caps: SCALE_COLOR }),
  model: type({ caps: { scale: true, rotate: true, color: false } }),
  empty: type({}),
} satisfies Record<string, RegionTypeInfo>;

export type RegionTypeName = keyof typeof REGION_TYPES;

/** A region type's facts; types the preview doesn't draw get the plain defaults. */
export function regionInfo(regionType: unknown): RegionTypeInfo {
  return (typeof regionType === "string" && REGION_TYPES[regionType as RegionTypeName]) || PLAIN;
}

/** Animation state a region draws with (Animations.lua: SetAnimRotation, negative Scale = mirroring). */
export interface RegionAnim {
  /** Absolute rotation in degrees while a rotate animation runs (replaces the base rotation). */
  rotation?: number;
  mirrorH?: boolean;
  mirrorV?: boolean;
}

export interface RegionProps {
  aura: AuraDocument;
  state: AuraRenderState;
  /** The aura's name (id), for %n. */
  name: string;
  /** The region's size in UI units (for auto-sized regions, the document's width/height). */
  width: number;
  height: number;
  /** Animation state the region draws itself (rotation, mirroring from a negative scale), while one runs. */
  anim?: RegionAnim;
}
