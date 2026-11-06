"use client";

import type { AuraDocument, LuaValue } from "@/core";
import type { AuraRenderState } from "./conditions";
import { frozenMarkerSize } from "./conditions/forever-rules";
import { FrozenMarker, textValues } from "./IconRegion";
import { MappedTexture } from "./MappedTexture";
import { textureSourceOf } from "./media";
import { fullBox, regionHost } from "./subregions/host";
import { SubRegions } from "./subregions/SubRegions";
import { color } from "./subregions/SubText";
import { affineFromCorners, textureCorners } from "./texture-geometry";
import styles from "./AuraPreview.module.css";

/** Animation state a region draws with (Animations.lua: SetAnimRotation, negative Scale = mirroring). */
export interface RegionAnim {
  /** Absolute rotation in degrees while a rotate animation runs (replaces the base rotation). */
  rotation?: number;
  mirrorH?: boolean;
  mirrorV?: boolean;
}

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

/** A texture setting that names something the preview can't load (an atlas name). */
export function unsupportedTexture(value: LuaValue | undefined): string | undefined {
  return typeof value === "string" && value !== "" && textureSourceOf(value) === null ? value : undefined;
}

/**
 * The texture region (RegionTypes/Texture.lua + BaseRegions/Texture.lua): one texture over the region, rotated by
 * texcoords (`rotation`, counter-clockwise; "Allow full rotation" shrinks it by √2 so the corners stay inside),
 * mirrored, desaturated, coloured and blended. Atlas names aren't drawn (labelled instead).
 */
export function TextureRegion({ aura, state, name, width, height, anim }: { aura: AuraDocument; state: AuraRenderState; name: string; width: number; height: number; anim?: RegionAnim }) {
  const p = state.properties;
  const textureValue = p.texture ?? aura.texture;
  const corners = textureCorners({
    rotation: anim?.rotation ?? num(p.rotation ?? aura.rotation, 0),
    canRotate: aura.rotate === true,
    mirror: (p.mirror ?? aura.mirror) === true,
    mirrorH: anim?.mirrorH,
    mirrorV: anim?.mirrorV,
  });
  const atlas = unsupportedTexture(textureValue);
  const background = (
    <MappedTexture
      source={textureSourceOf(textureValue)}
      box={fullBox(width, height)}
      map={affineFromCorners(corners)}
      color={color(p.color)}
      desaturate={p.desaturate === true}
      blendMode={aura.blendMode ?? "BLEND"}
      testId="texture-main"
      data={{ rotation: String(anim?.rotation ?? num(p.rotation ?? aura.rotation, 0)) }}
    >
      {atlas && <span className={styles.placeholderLabel}>Atlas {atlas} (not drawn)</span>}
    </MappedTexture>
  );
  return (
    <div className={styles.barFrame}>
      <SubRegions aura={aura} state={state} host={regionHost("texture", width, height)} values={textValues(state, name)} background={background} />
      {state.frozenMarker && <FrozenMarker size={frozenMarkerSize(width, height)} />}
    </div>
  );
}
