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

export const EXAMPLES: Record<string, AuraDocument> = {
  "buff-running-low": buffRunningLow,
  "buff-missing": buffMissing,
  "remaining-desaturates": remainingDesaturates,
  "secret-combat-condition": secretWithCombatCondition,
  "cooldown-icon": cooldownIcon,
  "target-debuff": targetDebuffAura2,
};
