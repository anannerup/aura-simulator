/**
 * The progress texture region's layers (RegionTypes/ProgressTexture.lua, BaseRegions/LinearProgressTexture.lua,
 * BaseRegions/CircularProgressTexture.lua) and its native variant (ProgressTextureSecret.lua,
 * ProgressTextureNative.lua, NativeProgressPainter.lua). Pure; no React.
 */
import { num, type LuaValue } from "@/core";
import type { Box } from "./bar-geometry";
import { inflate } from "./subregions/host";
import {
  circularProgressAngles,
  circularWedge,
  compressBox,
  linearOrientationOf,
  linearQuad,
  progressTexMap,
  quadPolygon,
  regionAngles,
  type Affine,
  type Pt,
  type LinearOrientation,
} from "./texture-geometry";


/**
 * ProgressTexture.lua:622-657 UpdateTime / 432-455 FrameTick: remaining / duration, flipped when Inverse is on, at
 * least 0.0001; 1 without a duration. `min`/`max` are the adjusted range (RegionPrototype UpdateProgressFromState).
 */
export function progressTextureProgress(o: { remaining?: number; duration: number; inverse: boolean; min?: number; max?: number }): number {
  if (o.remaining === undefined || !(o.duration > 0)) return 1;
  const min = o.min ?? 0;
  const max = o.max ?? o.duration;
  const span = max - min;
  let progress = span !== 0 ? (o.remaining - min) / span : 1;
  if (o.inverse) progress = 1 - progress;
  return progress > 0.0001 ? progress : 0.0001;
}

export interface ProgressLayer {
  role: "background" | "foreground";
  /** Px, relative to the region. */
  box: Box;
  /** Box coordinates; undefined = whole box, [] = nothing. */
  polygon?: Pt[];
  map: Affine;
}

export interface ProgressTextureSettings {
  width: number;
  height: number;
  orientation: LuaValue | undefined;
  progress: number;
  backgroundOffset: number;
  compress: boolean;
  slanted: boolean;
  slant: number;
  slantFirst: boolean;
  slantMode: LuaValue | undefined;
  startAngle: number;
  endAngle: number;
  cropX: number;
  cropY: number;
  texRotation: number;
  /** The Mirror option xor a negative animation scale. */
  mirrorH: boolean;
  mirrorV: boolean;
  userX: number;
  userY: number;
  /** Drawn natively (a duration object from an Aura / Aura (Modern) trigger). */
  native: boolean;
}

export const isCircular = (orientation: LuaValue | undefined) => orientation === "CLOCKWISE" || orientation === "ANTICLOCKWISE";

/**
 * The background and foreground of a progress texture at `progress`.
 *
 * Linear: the background is the whole texture grown by `backgroundOffset`; the foreground is the fill quad (slanted
 * when `slanted`), or with `compress` the whole image squeezed into the filled part. Texcoords follow TransformPoint:
 * crop (1 + crop_x/y), texture rotation, mirror, user offset (x negated, ProgressTexture.lua:895-896).
 *
 * Circular: both are square-pie wedges; the background spans start..end angle (ProgressTexture.lua:1019), the
 * foreground grows clockwise from the start or anticlockwise into the end. No user offset (CircularProgressTexture
 * passes none to Transform).
 *
 * Native (ProgressTextureSecret.lua:50-74, ProgressTextureNative.lua:56-78): the linear foreground stays full and
 * a rectangular mask follows the native status bar's fill, so slant doesn't cut it; with compress the art is
 * stretched over the fill instead. The circular one is Blizzard's radial progress over the same art and angles,
 * drawn here with the same wedge.
 */
export function progressTextureLayers(s: ProgressTextureSettings): ProgressLayer[] {
  const { width: w, height: h } = s;
  const full: Box = { left: 0, top: 0, width: w, height: h };
  const bgBox = inflate(full, s.backgroundOffset);
  const circular = isCircular(s.orientation);
  if (circular) {
    const map = progressTexMap({ scaleX: s.cropX, scaleY: s.cropY, texRotation: s.texRotation, mirrorH: s.mirrorH, mirrorV: s.mirrorV });
    const [start, end] = regionAngles(s.startAngle, s.endAngle);
    const [a1, a2] = circularProgressAngles(s.orientation === "CLOCKWISE", start, end, s.progress);
    return [
      { role: "background", box: bgBox, polygon: wedgePolygon(start, end), map },
      { role: "foreground", box: full, polygon: wedgePolygon(a1, a2), map },
    ];
  }
  const orientation: LinearOrientation = linearOrientationOf(s.orientation);
  const map = progressTexMap({ scaleX: s.cropX, scaleY: s.cropY, texRotation: s.texRotation, mirrorH: s.mirrorH, mirrorV: s.mirrorV, userX: s.userX, userY: s.userY });
  const progress = Math.min(1, Math.max(0, s.progress));
  const slant = s.slanted ? { slant: s.slant, slantFirst: s.slantFirst, mode: String(s.slantMode ?? "INSIDE") } : undefined;
  const background: ProgressLayer = { role: "background", box: bgBox, polygon: s.slanted ? quadPolygon(linearQuad(orientation, 0, 1, slant)) : undefined, map };
  if (s.compress) {
    const c = compressBox(orientation, progress);
    const box: Box = { left: c.x * w, top: c.y * h, width: c.w * w, height: c.h * h };
    // LinearProgressTexture.lua:227-232: below 10 % progress nothing shows.
    const visible = progress > 0.1;
    const quad = s.slanted && !s.native ? quadPolygon(linearQuad(orientation, 0, visible ? 1 : 0, slant)) : visible ? undefined : [];
    return [background, { role: "foreground", box, polygon: quad, map }];
  }
  const fill = s.native ? quadPolygon(linearQuad(orientation, 0, progress)) : quadPolygon(linearQuad(orientation, 0, progress, slant));
  return [background, { role: "foreground", box: full, polygon: fill, map }];
}

function wedgePolygon(a1: number, a2: number): Pt[] | undefined {
  const wedge = circularWedge(a1, a2);
  return wedge.kind === "full" ? undefined : wedge.kind === "none" ? [] : wedge.points;
}

/** The settings from an aura document and its condition-resolved properties. */
export function progressTextureSettings(
  aura: Record<string, LuaValue | undefined>,
  p: Record<string, LuaValue | undefined>,
  o: { width: number; height: number; progress: number; native: boolean; texRotation?: number; mirrorH?: boolean; mirrorV?: boolean },
): ProgressTextureSettings {
  const v = (k: string) => p[k] ?? aura[k];
  return {
    width: o.width,
    height: o.height,
    orientation: v("orientation") ?? "VERTICAL",
    progress: o.progress,
    backgroundOffset: num(aura.backgroundOffset, 2),
    compress: aura.compress === true,
    slanted: aura.slanted === true,
    slant: num(aura.slant, 0),
    slantFirst: aura.slantFirst === true,
    slantMode: aura.slantMode,
    startAngle: num(aura.startAngle, 0),
    endAngle: num(aura.endAngle, 360),
    cropX: 1 + num(v("crop_x"), 0.41),
    cropY: 1 + num(v("crop_y"), 0.41),
    texRotation: o.texRotation ?? num(v("rotation"), 0),
    mirrorH: (v("mirror") === true) !== (o.mirrorH === true),
    mirrorV: o.mirrorV === true,
    userX: -num(aura.user_x, 0),
    userY: num(aura.user_y, 0),
    native: o.native,
  };
}
