/** The component that draws each region type of the registry (`region-types.ts`). */
import type { ComponentType } from "react";
import { AuraBarRegion } from "./AuraBarRegion";
import { IconRegion } from "./IconRegion";
import { EmptyRegion, ModelRegion } from "./ModelRegion";
import { ProgressTextureRegion } from "./ProgressTextureRegion";
import type { RegionProps, RegionTypeName } from "./region-types";
import { StopMotionRegion } from "./StopMotionRegion";
import { TextRegion } from "./TextRegion";
import { TextureRegion } from "./TextureRegion";

const RENDERERS: Record<RegionTypeName, ComponentType<RegionProps>> = {
  icon: IconRegion,
  aurabar: AuraBarRegion,
  text: TextRegion,
  texture: TextureRegion,
  progresstexture: ProgressTextureRegion,
  stopmotion: StopMotionRegion,
  model: ModelRegion,
  empty: EmptyRegion,
};

/** The region type's component (as `.Region`, a static component), if the preview draws the type. */
export function regionRenderer(regionType: unknown): { Region: ComponentType<RegionProps> } | undefined {
  const Region = typeof regionType === "string" ? RENDERERS[regionType as RegionTypeName] : undefined;
  return Region && { Region };
}
