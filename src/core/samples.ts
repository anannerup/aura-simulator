import type { AuraDocument } from "./aura-core";

/**
 * The built-in sample: an icon for Arcane Intellect on the player, using the fork's combat-safe
 * "Aura (Modern)" trigger (`secretAura`). Fields the addon fills on import (Validate against the
 * region defaults) are left out.
 */
export function sampleIconAura(internalVersion: number): AuraDocument {
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
      "[1]": {
        trigger: {
          type: "secretAura",
          unit: "player",
          debuffType: "HELPFUL",
          auraspellids: ["1459"],
          secretUseSpellIDs: true,
          useExactSpellId: true,
          nativeFilters: { PLAYER: true },
        },
        untrigger: {},
      },
      activeTriggerMode: -10,
    },
    load: {},
    conditions: {},
    actions: { start: {}, finish: {}, init: {} },
  };
}
