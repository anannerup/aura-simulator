import type { AuraDocument } from "@/core";

/**
 * Sample auras written the way an agent would (only the fields that matter, no defaults), from
 * prototypes/headless-addon/samples.mjs. Expected results were read from the addon's own validation.
 */

const ARCANE_INTELLECT = "1459";

const modernTrigger = {
  type: "secretAura",
  unit: "player",
  debuffType: "HELPFUL",
  auraspellids: [ARCANE_INTELLECT],
  secretUseSpellIDs: true,
  secretShowOn: "showOnActive",
};

/** Combat-safe: Aura (Modern) trigger, remaining time < 180 s drives the glow only. */
export const modernGlowOk: AuraDocument = {
  id: "Arcane Intellect low (Modern)",
  uid: "simSample0001",
  regionType: "icon",
  width: 48,
  height: 48,
  triggers: [{ trigger: { ...modernTrigger }, untrigger: {} }],
  subRegions: [{ type: "subbackground" }, { type: "subglow", glow: false, glowType: "buttonOverlay" }],
  conditions: [
    {
      check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: "180" },
      changes: [{ property: "sub.2.glow", value: true }],
    },
  ],
};

/**
 * Combat-safe: the trigger's own Remaining Time window ("show my buff when less than 3 min is left"). The addon binds
 * it to a Blizzard aura slot (SecretAuraSingleRemaining.lua), which needs AuraContainer:AddAuraSlot from the profile.
 */
export const modernRemainingWindowOk: AuraDocument = {
  id: "Arcane Intellect under 3 min (Modern)",
  uid: "simSample0005",
  regionType: "icon",
  width: 48,
  height: 48,
  triggers: [{ trigger: { ...modernTrigger, secretUseRem: true, secretRemOperator: "<", secretRem: "180" }, untrigger: {} }],
  subRegions: [{ type: "subbackground" }],
  conditions: [],
};

/** Known-bad: a remaining-time condition drives desaturate, which an Aura (Modern) condition can't do. */
export const modernDesaturateBad: AuraDocument = {
  id: "Arcane Intellect low desat (Modern)",
  uid: "simSample0002",
  regionType: "icon",
  width: 48,
  height: 48,
  triggers: [{ trigger: { ...modernTrigger }, untrigger: {} }],
  subRegions: [{ type: "subbackground" }],
  conditions: [
    {
      check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: "180" },
      changes: [{ property: "desaturate", value: true }],
    },
  ],
};

/** Classic "Aura" (aura2) trigger with exact spell IDs: the game hides those lookups in combat. */
export const aura2SpellIds: AuraDocument = {
  id: "Arcane Intellect (aura2)",
  uid: "simSample0003",
  regionType: "icon",
  width: 48,
  height: 48,
  triggers: [
    {
      trigger: {
        type: "aura2",
        unit: "player",
        debuffType: "HELPFUL",
        useExactSpellId: true,
        auraspellids: [ARCANE_INTELLECT],
        matchesShowOn: "showOnActive",
      },
      untrigger: {},
    },
  ],
  subRegions: [{ type: "subbackground" }],
  conditions: [
    {
      check: { trigger: 1, variable: "expirationTime", op: "<", value: "180" },
      changes: [{ property: "desaturate", value: true }],
    },
  ],
};
