/**
 * Region and sub-region defaults for the properties conditions can change: the value a property has when the
 * aura document leaves it unset. Each table cites the addon's `default`.
 */
import type { LuaValue } from "@/core";

/** RegionTypes/Icon.lua:16-40, RegionPrototype AddAlphaToDefault. */
const ICON: Record<string, LuaValue> = {
  desaturate: false,
  inverse: false,
  color: [1, 1, 1, 1],
  zoom: 0,
  keepAspectRatio: false,
  cooldown: true,
  cooldownTextDisabled: false,
  cooldownSwipe: true,
  cooldownEdge: false,
  alpha: 1,
};

/** RegionTypes/AuraBar.lua:11-49 (the condition properties, :56-183). */
const AURABAR: Record<string, LuaValue> = {
  barColor: [1, 0, 0, 1],
  barColor2: [1, 1, 0, 1],
  enableGradient: false,
  backgroundColor: [0, 0, 0, 0.5],
  icon: false,
  icon_color: [1, 1, 1, 1],
  desaturate: false,
  sparkColor: [1, 1, 1, 1],
  sparkWidth: 10,
  sparkHeight: 30,
  orientation: "HORIZONTAL",
  inverse: false,
  alpha: 1,
};

/** RegionTypes/Text.lua:13-31. */
const TEXT: Record<string, LuaValue> = {
  color: [1, 1, 1, 1],
  fontSize: 12,
  displayText: "%p",
  alpha: 1,
};

const REGIONS: Record<string, Record<string, LuaValue>> = { icon: ICON, aurabar: AURABAR, text: TEXT };

export function regionDefaults(regionType: LuaValue | undefined): Record<string, LuaValue> {
  return REGIONS[String(regionType)] ?? { alpha: 1 };
}

/**
 * Sub-region defaults for their condition properties: SubText.lua:16-67 (the same for icon and bar parents for
 * these keys), Glow.lua:12-32, Border.lua:10-23, Tick.lua:9-27.
 */
const SUB: Record<string, Record<string, LuaValue>> = {
  subtext: { text_color: [1, 1, 1, 1], text_visible: true, text_fontSize: 12, text_alpha: 1 },
  subglow: { glow: false },
  subborder: { border_visible: true, border_color: [1, 1, 1, 1] },
  subtick: { tick_visible: true, tick_color: [1, 1, 1, 1] },
};

export function subRegionDefaults(type: LuaValue | undefined): Record<string, LuaValue> {
  return SUB[String(type)] ?? {};
}
