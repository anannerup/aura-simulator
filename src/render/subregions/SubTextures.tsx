"use client";

import { getField, type AuraRenderState, type LuaTable, type LuaValue } from "@/core";
import { anchorFraction } from "../screen/geometry";
import type { Box } from "../bar-geometry";
import { useRegionClock } from "../clock";
import { MappedTexture } from "../MappedTexture";
import { textureSourceOf } from "../media";
import { ModelPlaceholder, modelLabel } from "../ModelRegion";
import { DEFAULT_STOP_MOTION_TEXTURE, stopMotionFrame, stopMotionSheet } from "../stop-motion";
import { StopMotionFrame } from "../StopMotionRegion";
import {
  affineFromCorners,
  circularProgressAngles,
  circularWedge,
  linearOrientationOf,
  linearQuad,
  progressTexMap,
  quadPolygon,
  textureCorners,
} from "../texture-geometry";
import { anchorPosition, type SubRegionHost } from "./host";
import { color } from "../color";

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

/**
 * Where a texture-like sub-element goes (the sub-region's modify + RegionPrototype.lua:804-823 AnchorSubRegion):
 * "area" mode covers the anchor area (aura bars default to the bar) grown by xOffset/yOffset; "point" mode is
 * `width`×`height` with its `self_point` on the parent's `anchor_point`, moved by the offsets (y up).
 */
export function subElementBox(element: LuaTable, host: SubRegionHost): Box {
  const g = (k: string) => getField(element, k);
  const x = num(g("xOffset"), 0);
  const y = num(g("yOffset"), 0);
  if (g("anchor_mode") === "point") {
    const w = num(g("width"), 32);
    const h = num(g("height"), 32);
    const at = anchorPosition(host.point(typeof g("anchor_point") === "string" ? String(g("anchor_point")) : "CENTER"), x, y);
    const [sx, sy] = anchorFraction(g("self_point"));
    return { left: at.left - w * sx, top: at.top - h * sy, width: w, height: h };
  }
  const box = host.area(g("anchor_area"), "border");
  return { left: box.left - x, top: box.top - y, width: box.width + 2 * x, height: box.height + 2 * y };
}

/** Elapsed/remaining progress of the dynamic trigger for a sub-element (Linear/CircularProgressTexture UpdateFrame). */
function subProgress(state: AuraRenderState, inverse: boolean): number | undefined {
  const d = state.dynamic;
  if (!d) return undefined;
  if (!(d.duration > 0) || d.remaining === undefined) return 0;
  const progress = d.remaining / d.duration;
  return inverse ? 1 - progress : progress;
}

interface SubProps {
  element: LuaTable;
  position: number;
  state: AuraRenderState;
  host: SubRegionHost;
}

const prop = (state: AuraRenderState, position: number, key: string) => state.properties[`sub.${position}.${key}`];

/** SubRegionTypes/Texture.lua: a texture with the texture region's rotation, mirror, colour and blend mode. */
export function SubTexture({ element, position, state, host }: SubProps) {
  const v = (k: string) => prop(state, position, k);
  if (v("textureVisible") === false) return null;
  const corners = textureCorners({ rotation: num(v("textureRotation"), 0), canRotate: v("textureRotate") === true, mirror: v("textureMirror") === true });
  return (
    <MappedTexture
      source={textureSourceOf(v("textureTexture") ?? "Interface\\Addons\\WeakAuras\\PowerAurasMedia\\Auras\\Aura3")}
      box={subElementBox(element, host)}
      map={affineFromCorners(corners)}
      color={color(v("textureColor"))}
      desaturate={v("textureDesaturate") === true}
      blendMode={v("textureBlendMode")}
      data={{ subregion: "subtexture", index: String(position) }}
    />
  );
}

/** SubRegionTypes/LinearProgressTexture.lua: a linear progress texture following the dynamic trigger. */
export function SubLinearTexture({ element, position, state, host }: SubProps) {
  const v = (k: string) => prop(state, position, k);
  if (v("linearTextureVisible") === false) return null;
  const progress = subProgress(state, v("linearTextureInverse") === true);
  const p = Math.min(1, Math.max(0, progress ?? 1));
  const map = progressTexMap({
    scaleX: 1 + num(v("linearTextureCrop_x"), 0.41),
    scaleY: 1 + num(v("linearTextureCrop_y"), 0.41),
    texRotation: num(v("linearTextureRotation"), 0),
    mirrorH: v("linearTextureMirror") === true,
    mirrorV: false,
    userX: -num(v("linearTextureUser_x"), 0),
    userY: num(v("linearTextureUser_y"), 0),
  });
  return (
    <MappedTexture
      source={textureSourceOf(v("linearTextureTexture") ?? "Interface\\AddOns\\WeakAuras\\Media\\Textures\\Square_FullWhite")}
      box={subElementBox(element, host)}
      polygon={quadPolygon(linearQuad(linearOrientationOf(v("linearTextureOrientation") ?? "HORIZONTAL"), 0, p))}
      map={map}
      spin={num(v("linearTextureAuraRotation"), 0)}
      color={color(v("linearTextureColor"))}
      desaturate={v("linearTextureDesaturate") === true}
      blendMode={v("linearTextureBlendMode")}
      data={{ subregion: "sublineartexture", index: String(position), progress: p.toFixed(4) }}
    />
  );
}

/**
 * SubRegionTypes/CircularProgressTexture.lua: a circular progress texture. Its angles are used as set (no modulo,
 * unlike the region).
 */
export function SubCircularTexture({ element, position, state, host }: SubProps) {
  const v = (k: string) => prop(state, position, k);
  if (v("circularTextureVisible") === false) return null;
  const progress = subProgress(state, v("circularTextureInverse") === true);
  const start = num(v("circularTextureStartAngle"), 0);
  const end = num(v("circularTextureEndAngle"), 360);
  const [a1, a2] = progress === undefined ? [start, start + 360] : circularProgressAngles(v("circularTextureClockwise") !== false, start, end, progress);
  const wedge = circularWedge(a1, a2);
  const map = progressTexMap({
    scaleX: 1 + num(v("circularTextureCrop_x"), 0.41),
    scaleY: 1 + num(v("circularTextureCrop_y"), 0.41),
    texRotation: num(v("circularTextureRotation"), 0),
    mirrorH: v("circularTextureMirror") === true,
    mirrorV: false,
  });
  return (
    <MappedTexture
      source={textureSourceOf(v("circularTextureTexture") ?? "Interface\\AddOns\\WeakAuras\\Media\\Textures\\square_border_5px.tga")}
      box={subElementBox(element, host)}
      polygon={wedge.kind === "full" ? undefined : wedge.kind === "none" ? [] : wedge.points}
      map={map}
      spin={num(v("circularTextureAuraRotation"), 0)}
      color={color(v("circularTextureColor"))}
      desaturate={v("circularTextureDesaturate") === true}
      blendMode={v("circularTextureBlendMode")}
      data={{ subregion: "subcirculartexture", index: String(position), angles: `${a1.toFixed(1)},${a2.toFixed(1)}` }}
    />
  );
}

/**
 * SubRegionTypes/StopMotion.lua: a stop motion sheet. On an aura bar's foreground area with "Clip to foreground"
 * (`barModelClip`) it spans the bar and is clipped to the fill; in area mode a `scale` other than 1 sizes it around
 * the area's centre (OnSizeChanged).
 */
export function SubStopMotion({ element, position, state, host }: SubProps) {
  const seconds = useRegionClock();
  const v = (k: string) => prop(state, position, k);
  if (v("stopmotionVisible") === false) return null;
  const g = (k: string) => getField(element, k);
  const texture = typeof g("stopmotionTexture") === "string" ? String(g("stopmotionTexture")) : DEFAULT_STOP_MOTION_TEXTURE;
  const sheet = stopMotionSheet({
    texture,
    startPercent: num(g("startPercent"), 0),
    endPercent: num(g("endPercent"), 1),
    customFrames: typeof g("customFrames") === "number" ? (g("customFrames") as number) : undefined,
    customRows: num(g("customRows"), 16),
    customColumns: num(g("customColumns"), 16),
    customFileWidth: num(g("customFileWidth"), 0),
    customFileHeight: num(g("customFileHeight"), 0),
    customFrameWidth: num(g("customFrameWidth"), 0),
    customFrameHeight: num(g("customFrameHeight"), 0),
  });
  const frame = stopMotionFrame(sheet, {
    animationType: g("animationType"),
    frameRate: num(g("frameRate"), 15),
    inverse: g("inverse") === true,
    seconds,
    timer: state.dynamic,
  });
  const area = g("anchor_mode") !== "point";
  const clip = host.bar !== undefined && area && g("anchor_area") === "fg" && g("barModelClip") !== false;
  let box = subElementBox(element, host);
  const scale = num(g("scale"), 1);
  let clipBox: Box | undefined;
  if (clip) {
    clipBox = host.area("fg", "border");
    const bar = host.area("bar", "border");
    box = { left: bar.left - clipBox.left, top: bar.top - clipBox.top, width: bar.width, height: bar.height };
  } else if (area && scale !== 1) {
    box = { left: box.left + (box.width * (1 - scale)) / 2, top: box.top + (box.height * (1 - scale)) / 2, width: box.width * scale, height: box.height * scale };
  }
  const drawing = (
    <StopMotionFrame
      texture={texture}
      sheet={sheet}
      frame={frame}
      box={box}
      color={color(v("stopmotionColor"))}
      desaturate={v("stopmotionDesaturate") === true}
      blendMode={g("stopmotionBlendMode")}
      testId={`substopmotion-${position}`}
    />
  );
  return (
    <div data-subregion="substopmotion" data-index={position} data-frame={frame} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {clipBox ? (
        <div style={{ position: "absolute", left: clipBox.left, top: clipBox.top, width: clipBox.width, height: clipBox.height, overflow: "hidden" }}>{drawing}</div>
      ) : (
        drawing
      )}
    </div>
  );
}

/**
 * SubRegionTypes/Model.lua: a model over the parent (on aura bars the fill when attached, else the bar, grown by
 * extra_width/height), as a labelled placeholder.
 */
export function SubModel({ element, position, state, host }: SubProps) {
  const v = (k: string) => prop(state, position, k);
  if (v("model_visible") === false) return null;
  const g = (k: string) => getField(element, k);
  const bar = host.bar !== undefined;
  const attach = g("bar_model_attach") !== false;
  const anchor = bar ? host.area(attach ? "fg" : "bar", "border") : host.area(undefined, "border");
  const ew = bar && attach ? 0 : num(g("extra_width"), 0);
  const eh = bar && attach ? 0 : num(g("extra_height"), 0);
  const label = modelLabel({ model_fileId: g("model_fileId"), modelIsUnit: g("modelIsUnit"), model_path: g("model_path") }, "235338");
  return (
    <div data-subregion="submodel" data-index={position} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: num(v("model_alpha"), 1) }}>
      <ModelPlaceholder
        label={label}
        testId={`submodel-${position}`}
        style={{ left: anchor.left - ew / 2, top: anchor.top - eh / 2, width: anchor.width + ew, height: anchor.height + eh }}
      />
    </div>
  );
}
