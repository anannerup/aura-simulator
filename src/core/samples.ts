import type { AuraDocument } from "./aura-core";
import type { AddonGameId } from "./addon-vm/toc";
import type { LuaObject } from "./lua-value";

/** The sample's trigger per game: the aura trigger players use for a buff there. */
const SAMPLE_TRIGGERS: Record<AddonGameId, LuaObject> = {
  // Musca's combat-safe "Aura (Modern)" trigger; Arcane Intellect (1459) as Forever knows it.
  forever: {
    type: "secretAura",
    unit: "player",
    debuffType: "HELPFUL",
    auraspellids: ["1459"],
    secretUseSpellIDs: true,
    useExactSpellId: true,
    nativeFilters: { PLAYER: true },
  },
  // WeakAuras2's plain "Aura" trigger (BuffTrigger2); Arcane Intellect rank 6 (27126), TBC's highest.
  tbc: { type: "aura2", unit: "player", debuffType: "HELPFUL", auraspellids: ["27126"], useExactSpellId: true },
};

/**
 * The built-in sample: an icon for the player's Arcane Intellect, on the game's buff trigger (`SAMPLE_TRIGGERS`).
 * Fields the addon fills on import (Validate against the region defaults) are left out.
 */
export function sampleIconAura(internalVersion: number, game: AddonGameId = "forever"): AuraDocument {
  return {
    id: "Arcane Intellect",
    uid: "AuraSimIcn1",
    internalVersion,
    regionType: "icon",
    information: { showNilIsFalse: true },
    displayIcon: 135932,
    iconSource: -1,
    desaturate: false,
    width: 64,
    height: 64,
    anchorFrameType: "SCREEN",
    anchorPoint: "CENTER",
    selfPoint: "CENTER",
    xOffset: 0,
    yOffset: 0,
    cooldown: true,
    triggers: {
      "[1]": { trigger: { ...SAMPLE_TRIGGERS[game] }, untrigger: {} },
      activeTriggerMode: -10,
    },
    load: {},
    conditions: {},
    actions: { start: {}, finish: {}, init: {} },
  };
}
