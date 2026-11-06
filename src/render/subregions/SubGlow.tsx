"use client";

import { getField, type LuaTable, type LuaValue } from "@/core";
import type { GlowState } from "../conditions";
import { GLOW_DEFAULTS, Glow, type GlowOptions, type GlowType } from "../glow";
import type { SubRegionHost } from "./host";
import styles from "./subregions.module.css";

const TYPES = new Set<GlowType>(["buttonOverlay", "Pixel", "ACShine", "Proc"]);

/** Glow.lua:12-32 default(parentType): bars default to a Pixel glow on the whole bar ("bar" area), others to the button overlay. */
export function glowTypeOf(element: LuaTable, regionType: string): GlowType {
  const value = getField(element, "glowType");
  if (typeof value === "string" && TYPES.has(value as GlowType)) return value as GlowType;
  return regionType === "aurabar" ? "Pixel" : "buttonOverlay";
}

/** The glow sub-region's options as the renderer takes them; missing fields keep Glow.lua's defaults. */
export function glowOptions(element: LuaTable, properties: Record<string, LuaValue>, position: number): Partial<GlowOptions> {
  const options: Record<string, unknown> = {};
  for (const key of Object.keys(GLOW_DEFAULTS) as (keyof GlowOptions)[]) {
    const value = properties[`sub.${position}.${key}`] ?? getField(element, key);
    if (value === undefined) continue;
    if (key === "glowColor") {
      if (Array.isArray(value) && value.length >= 3) options[key] = [0, 1, 2, 3].map((i) => (typeof value[i] === "number" ? value[i] : 1));
    } else if (typeof value === typeof GLOW_DEFAULTS[key]) options[key] = value;
  }
  const start = getField(element, "glowStartAnim");
  if (typeof start === "boolean") options.glowStartAnim = start;
  return options as Partial<GlowOptions>;
}

/**
 * A glow sub-region (SubRegionTypes/Glow.lua) on its anchor area: for aura bars `anchor_area` (bar = the whole
 * region, icon, fg = the filled part, bg = the bar), for other regions the region (Glow.lua:410-417). `glow.visible`
 * is `sub.N.glow` after conditions; switching it off plays the button glow's fade-out.
 */
export function SubGlow({ glow, properties, host }: { glow: GlowState; properties: Record<string, LuaValue>; host: SubRegionHost }) {
  const type = glowTypeOf(glow.element, host.regionType);
  const area = host.regionType === "aurabar" ? getField(glow.element, "anchor_area") ?? "bar" : undefined;
  const box = host.area(area, "glow");
  return (
    <div
      className={styles.layer}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      data-subregion="subglow"
      data-index={glow.index}
      data-glow={glow.visible ? "on" : "off"}
      data-glow-type-name={type}
    >
      <Glow type={type} options={glowOptions(glow.element, properties, glow.index)} width={box.width} height={box.height} visible={glow.visible} />
    </div>
  );
}
