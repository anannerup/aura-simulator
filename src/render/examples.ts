/**
 * Example auras for the situation lab page (`/lab`) and the renderer tests: one per trigger kind and
 * combat behaviour. Plain aura documents, as the addon stores them.
 */
import type { AuraDocument, LuaObject } from "@/core";

const ICON_BASE = {
  regionType: "icon",
  displayIcon: 135932,
  width: 64,
  height: 64,
  anchorPoint: "CENTER",
  selfPoint: "CENTER",
  xOffset: 0,
  yOffset: 0,
  cooldown: true,
  cooldownTextDisabled: true,
  load: {},
  actions: { start: {}, finish: {}, init: {} },
};

const durationText = (extra: LuaObject = {}): LuaObject => ({
  type: "subtext",
  text_text: "%p",
  text_color: [1, 1, 1, 1],
  text_font: "Friz Quadrata TT",
  text_fontSize: 14,
  text_fontType: "OUTLINE",
  text_visible: true,
  text_justify: "CENTER",
  text_selfPoint: "AUTO",
  anchor_point: "CENTER",
  anchorXOffset: 0,
  anchorYOffset: 0,
  ...extra,
});

const stackText = (): LuaObject => durationText({ text_text: "%s", anchor_point: "INNER_BOTTOMRIGHT", text_fontSize: 12 });

const glow = (on = false): LuaObject => ({ type: "subglow", glow: on, glowType: "buttonOverlay", useGlowColor: false });

const secretTrigger = (extra: LuaObject = {}): LuaObject => ({
  type: "secretAura",
  unit: "player",
  debuffType: "HELPFUL",
  auraspellids: ["1459"],
  secretUseSpellIDs: true,
  useExactSpellId: true,
  nativeFilters: { PLAYER: true },
  ...extra,
});

/** v1 acceptance aura 1a: desaturated buff icon that glows when under 3 minutes are left. */
export const buffRunningLow: AuraDocument = {
  ...ICON_BASE,
  id: "Arcane Intellect low",
  desaturate: true,
  subRegions: [durationText(), glow()],
  triggers: { "[1]": { trigger: secretTrigger(), untrigger: {} }, activeTriggerMode: -10 },
  conditions: [
    { check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: 180 }, changes: [{ property: "sub.2.glow", value: true }] },
    { check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: 10 }, changes: [{ property: "sub.1.text_color", value: [1, 0, 0, 1] }] },
  ],
};

/** v1 acceptance aura 1b: desaturated and glowing while the buff is missing. */
export const buffMissing: AuraDocument = {
  ...ICON_BASE,
  id: "Arcane Intellect missing",
  subRegions: [glow()],
  triggers: { "[1]": { trigger: secretTrigger({ secretShowOn: "showOnMissing" }), untrigger: {} }, activeTriggerMode: -10 },
  conditions: [
    {
      check: { trigger: 1, variable: "faAuraMissing" },
      changes: [
        { property: "desaturate", value: true },
        { property: "sub.1.glow", value: true },
      ],
    },
  ],
};

/** Not allowed by Aura (Modern): seconds left can't drive desaturation (SecretAuraConditions.lua:489-490). */
export const remainingDesaturates: AuraDocument = {
  ...ICON_BASE,
  id: "Remaining desaturates",
  subRegions: [durationText()],
  triggers: { "[1]": { trigger: secretTrigger(), untrigger: {} }, activeTriggerMode: -10 },
  conditions: [{ check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: 10 }, changes: [{ property: "desaturate", value: true }] }],
};

/** Aura (Modern) with a global "in combat" condition: generic changes hold their pre-combat value. */
export const secretWithCombatCondition: AuraDocument = {
  ...ICON_BASE,
  id: "Secret in combat",
  subRegions: [durationText()],
  triggers: { "[1]": { trigger: secretTrigger(), untrigger: {} }, activeTriggerMode: -10 },
  conditions: [{ check: { trigger: -1, variable: "incombat", value: 1 }, changes: [{ property: "desaturate", value: true }] }],
};

/** v1 acceptance aura 2: a cooldown icon that desaturates while on cooldown. */
export const cooldownIcon: AuraDocument = {
  ...ICON_BASE,
  id: "Fire Blast cooldown",
  displayIcon: 134400,
  cooldownTextDisabled: false,
  subRegions: [stackText()],
  triggers: {
    "[1]": {
      trigger: { type: "spell", event: "Cooldown Progress (Spell)", spellName: 2136, genericShowOn: "showAlways", use_genericShowOn: true },
      untrigger: {},
    },
    activeTriggerMode: -10,
  },
  conditions: [{ check: { trigger: 1, variable: "onCooldown", value: 1 }, changes: [{ property: "desaturate", value: true }] }],
};

/** An old "Aura" (aura2) trigger by spell ID on the target: freezes in combat (padlock). */
export const targetDebuffAura2: AuraDocument = {
  ...ICON_BASE,
  id: "Target debuff",
  inverse: true,
  cooldownEdge: true,
  subRegions: [durationText(), stackText()],
  triggers: {
    "[1]": {
      trigger: { type: "aura2", unit: "target", debuffType: "HARMFUL", useExactSpellId: true, auraspellids: ["116"], ownOnly: true },
      untrigger: {},
    },
    activeTriggerMode: -10,
  },
  conditions: [
    { check: { trigger: 1, variable: "stacks", op: ">=", value: 3 }, changes: [{ property: "color", value: [1, 0.3, 0.3, 1] }] },
    { check: { trigger: 1, variable: "expirationTime", op: "<", value: 5 }, changes: [{ property: "alpha", value: 0.5 }] },
  ],
};

const barText = (text: string, anchor: string, extra: LuaObject = {}): LuaObject => ({
  type: "subtext",
  text_text: text,
  text_color: [1, 1, 1, 1],
  text_font: "Friz Quadrata TT",
  text_fontSize: 12,
  text_fontType: "None",
  text_justify: "CENTER",
  text_visible: true,
  text_selfPoint: "AUTO",
  anchor_point: anchor,
  anchorXOffset: 0,
  anchorYOffset: 0,
  text_shadowColor: [0, 0, 0, 1],
  text_shadowXOffset: 1,
  text_shadowYOffset: -1,
  rotateText: "NONE",
  ...extra,
});

const BAR_BASE = {
  regionType: "aurabar",
  width: 220,
  height: 22,
  anchorPoint: "CENTER",
  selfPoint: "CENTER",
  xOffset: 0,
  yOffset: 0,
  texture: "Blizzard",
  orientation: "HORIZONTAL",
  inverse: false,
  icon: true,
  icon_side: "LEFT",
  barColor: [0.62, 0.22, 0.85, 1],
  backgroundColor: [0, 0, 0, 0.5],
  spark: true,
  load: {},
  actions: { start: {}, finish: {}, init: {} },
};

const playerBuff = (): LuaObject => ({ type: "aura2", unit: "player", debuffType: "HELPFUL", useName: true, auranames: ["Arcane Intellect"] });

/**
 * v1 acceptance aura 3: a debuff's time left on the target as a bar, combat-safe. Aura (Modern) draws bars
 * natively (BlizzardAuraDisplayTrigger.lua:135 REGION_TYPES has aurabar; AuraBarNative.lua follows the game's
 * duration object in combat). Limits on bars: no Remaining Time window (icon only, SecretAuraSingleStatus.lua:42)
 * and no time-left glow (needs an icon, :19-30); the %p text colour rule does work (SecretAuraConditions.lua:657).
 */
export const targetDebuffBar: AuraDocument = {
  ...BAR_BASE,
  id: "Corruption on target",
  displayIcon: 136118,
  subRegions: [{ type: "subbackground" }, { type: "subforeground" }, barText("%n", "INNER_LEFT"), barText("%p", "INNER_RIGHT")],
  triggers: {
    "[1]": { trigger: secretTrigger({ unit: "target", debuffType: "HARMFUL", auraspellids: ["172"] }), untrigger: {} },
    activeTriggerMode: -10,
  },
  conditions: [
    { check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: 5 }, changes: [{ property: "sub.4.text_color", value: [1, 0.2, 0.2, 1] }] },
  ],
};

/** A bar with ticks, a border and a Pixel glow (the bar default) lit by a condition. */
export const tickedBar: AuraDocument = {
  ...BAR_BASE,
  id: "Ticks and border",
  displayIcon: 135932,
  texture: "Solid",
  barColor: [0.2, 0.6, 1, 1],
  backgroundColor: [0.05, 0.05, 0.1, 0.8],
  subRegions: [
    { type: "subbackground" },
    { type: "subforeground" },
    barText("%p", "INNER_RIGHT"),
    {
      type: "subtick",
      tick_visible: true,
      tick_color: [1, 1, 1, 1],
      tick_placement_mode: "AtValue",
      tick_placements: ["10", "30"],
      automatic_length: true,
      tick_thickness: 2,
      tick_length: 30,
      use_texture: false,
      tick_xOffset: 0,
      tick_yOffset: 0,
    },
    { type: "subborder", border_visible: true, border_color: [0, 0, 0, 1], border_edge: "Square Full White", border_offset: 1, border_size: 1, anchor_area: "bar" },
    {
      type: "subglow",
      glow: false,
      glowType: "Pixel",
      useGlowColor: true,
      glowColor: [1, 0.85, 0.2, 1],
      glowLines: 8,
      glowFrequency: 0.25,
      glowLength: 10,
      glowThickness: 2,
      glowXOffset: 0,
      glowYOffset: 0,
      anchor_area: "bar",
    },
  ],
  triggers: { "[1]": { trigger: playerBuff(), untrigger: {} }, activeTriggerMode: -10 },
  conditions: [{ check: { trigger: 1, variable: "expirationTime", op: "<", value: 10 }, changes: [{ property: "sub.6.glow", value: true }] }],
};

/** A vertical bar growing from the bottom (VERTICAL_INVERSE), icon on top, with its time text. */
export const verticalBar: AuraDocument = {
  ...BAR_BASE,
  id: "Vertical",
  width: 24,
  height: 160,
  orientation: "VERTICAL_INVERSE",
  displayIcon: 135932,
  barColor: [0.3, 0.9, 0.3, 1],
  subRegions: [{ type: "subbackground" }, { type: "subforeground" }, barText("%p", "INNER_BOTTOM")],
  triggers: { "[1]": { trigger: playerBuff(), untrigger: {} }, activeTriggerMode: -10 },
  conditions: [],
};

/** A text region with format codes: the aura's name and the cooldown's time left, grey while on cooldown. */
export const cooldownText: AuraDocument = {
  regionType: "text",
  id: "Fire Blast",
  displayText: "%n: %p",
  font: "Friz Quadrata TT",
  fontSize: 24,
  outline: "OUTLINE",
  color: [1, 0.82, 0, 1],
  justify: "LEFT",
  selfPoint: "BOTTOM",
  anchorPoint: "CENTER",
  xOffset: 0,
  yOffset: 0,
  automaticWidth: "Auto",
  shadowColor: [0, 0, 0, 1],
  shadowXOffset: 1,
  shadowYOffset: -1,
  load: {},
  actions: { start: {}, finish: {}, init: {} },
  subRegions: [{ type: "subbackground" }],
  triggers: {
    "[1]": {
      trigger: { type: "spell", event: "Cooldown Progress (Spell)", spellName: 2136, genericShowOn: "showAlways", use_genericShowOn: true },
      untrigger: {},
    },
    activeTriggerMode: -10,
  },
  conditions: [{ check: { trigger: 1, variable: "onCooldown", value: 1 }, changes: [{ property: "color", value: [0.6, 0.6, 0.6, 1] }] }],
};

export const EXAMPLES: Record<string, AuraDocument> = {
  "buff-running-low": buffRunningLow,
  "buff-missing": buffMissing,
  "remaining-desaturates": remainingDesaturates,
  "secret-combat-condition": secretWithCombatCondition,
  "cooldown-icon": cooldownIcon,
  "target-debuff": targetDebuffAura2,
  "target-debuff-bar": targetDebuffBar,
  "ticked-bar": tickedBar,
  "vertical-bar": verticalBar,
  "cooldown-text": cooldownText,
};
