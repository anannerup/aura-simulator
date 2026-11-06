/**
 * Region types the preview can draw, by `regionType`. AuraPreview looks renderers up here; new region types
 * (groups, textures, ...) register themselves by adding an entry.
 */
import type { ComponentType } from "react";
import type { AuraDocument } from "@/core";
import { AuraBarRegion } from "./AuraBarRegion";
import type { AuraRenderState } from "./conditions";
import { IconRegion } from "./IconRegion";
import { EmptyRegion, ModelRegion } from "./ModelRegion";
import { ProgressTextureRegion } from "./ProgressTextureRegion";
import { StopMotionRegion } from "./StopMotionRegion";
import { TextRegion } from "./TextRegion";
import { TextureRegion, type RegionAnim } from "./TextureRegion";

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

export interface RegionType {
  render: ComponentType<RegionProps>;
  /**
   * The region is sized by its content (text regions): the preview pins its `selfPoint` at the anchor and lets
   * the content set the size, instead of using the document's width and height.
   */
  autoSize?: boolean;
}

export const REGION_TYPES: Record<string, RegionType> = {
  icon: { render: IconRegion },
  aurabar: { render: AuraBarRegion },
  text: { render: TextRegion, autoSize: true },
  texture: { render: TextureRegion },
  progresstexture: { render: ProgressTextureRegion },
  stopmotion: { render: StopMotionRegion },
  model: { render: ModelRegion },
  empty: { render: EmptyRegion },
};

export function regionType(type: unknown): RegionType | undefined {
  return typeof type === "string" ? REGION_TYPES[type] : undefined;
}
