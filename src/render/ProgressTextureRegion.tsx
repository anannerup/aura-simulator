"use client";

import type { LuaValue, AuraRenderState } from "@/core";
import { barProgress } from "./bar-geometry";
import { MappedTexture } from "./MappedTexture";
import { textureSourceOf } from "./media";
import { isCircular, progressTextureLayers, progressTextureProgress, progressTextureSettings } from "./progress-texture";
import { regionHost } from "./subregions/host";
import { SubRegions } from "./subregions/SubRegions";
import { color } from "./color";
import { circularProgressAngles, regionAngles } from "./texture-geometry";
import styles from "./regions.module.css";
import type { RegionProps } from "./region-types";

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

/** A duration object reaches the region from Aura and Aura (Modern) triggers (BuffTrigger2.lua:937, RegionPrototype.lua:473). */
function drawsNatively(state: AuraRenderState): boolean {
  const d = state.dynamic;
  return d !== undefined && (d.kind === "aura2" || d.kind === "secretAura") && d.remaining !== undefined && d.duration > 0;
}

/**
 * The progress texture region (RegionTypes/ProgressTexture.lua): a background and a foreground texture filled from
 * the dynamic trigger's timer, linear (four orientations, slant, compress) or circular (clockwise/anticlockwise
 * between start and end angle), with crop, texture rotation, mirror, user offset and the whole-quad rotation
 * (`auraRotation`). Geometry in `progress-texture.ts`.
 */
export function ProgressTextureRegion({ aura, state, name, width, height, anim }: RegionProps) {
  const p = state.properties;
  const dynamic = state.dynamic;
  const inverse = p.inverse === true;
  const range = barProgress({ remaining: dynamic?.remaining, duration: dynamic?.duration ?? 0, inverse: false, adjustedMin: aura.adjustedMin, adjustedMax: aura.adjustedMax });
  const progress = state.missing
    ? 0.0001
    : progressTextureProgress({ remaining: dynamic?.remaining, duration: dynamic?.duration ?? 0, inverse, min: range.min, max: range.max || undefined });
  const native = drawsNatively(state);
  const settings = progressTextureSettings(aura, p, { width, height, progress, native, texRotation: anim?.rotation, mirrorH: anim?.mirrorH, mirrorV: anim?.mirrorV });
  const layers = progressTextureLayers(settings);
  const foregroundTexture = textureSourceOf(p.foregroundTexture ?? "Interface\\Addons\\WeakAuras\\PowerAurasMedia\\Auras\\Aura3");
  const backgroundTexture = aura.sameTexture === false ? textureSourceOf(aura.backgroundTexture) : foregroundTexture;
  const spin = num(p.auraRotation, 0);
  const orientation = String(settings.orientation);
  const angles = isCircular(settings.orientation)
    ? circularProgressAngles(orientation === "CLOCKWISE", ...regionAngles(settings.startAngle, settings.endAngle), progress).map((a) => a.toFixed(1)).join(",")
    : "";
  const background = (
    <>
      {layers.map((layer) => {
        const fg = layer.role === "foreground";
        return (
          <MappedTexture
            key={layer.role}
            source={fg ? foregroundTexture : backgroundTexture}
            box={layer.box}
            polygon={layer.polygon}
            map={layer.map}
            spin={spin}
            color={color(fg ? p.foregroundColor : p.backgroundColor, fg ? [1, 1, 1, 1] : [0.5, 0.5, 0.5, 0.5])}
            desaturate={(fg ? p.desaturateForeground : p.desaturateBackground) === true}
            blendMode={aura.blendMode ?? "BLEND"}
            testId={fg ? "progress-foreground" : "progress-background"}
            data={fg ? { progress: progress.toFixed(4), angles } : {}}
          />
        );
      })}
    </>
  );
  return (
    <div className={styles.regionFrame} data-orientation={orientation} data-native={native ? "true" : "false"}>
      <SubRegions aura={aura} state={state} host={regionHost("progresstexture", width, height)} name={name} background={background} />
    </div>
  );
}
