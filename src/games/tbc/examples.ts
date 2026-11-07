/**
 * TBC's example auras: the documents its agent docs show and the browser tests push (plain data; no imports, so
 * Playwright can load it). The full worked examples as wago JSON are ticket 08.
 */

/** The same aura as wago JSON (number keys as strings; keys sorted, as wago writes them): the docs' push example. */
export const TBC_MINIMAL_WAGO_JSON = {
  d: {
    displayIcon: 135932,
    id: "Arcane Intellect",
    regionType: "icon",
    triggers: {
      "1": { trigger: { auraspellids: ["27126"], debuffType: "HELPFUL", type: "aura2", unit: "player", useExactSpellId: true }, untrigger: [] },
      activeTriggerMode: -10,
    },
  },
  m: "d",
};

/** A complete push body: an icon for the player's Arcane Intellect (rank 6, 27126) on the plain Aura trigger. */
export const TBC_MINIMAL_PUSH = {
  aura: {
    id: "Arcane Intellect",
    regionType: "icon",
    displayIcon: 135932,
    triggers: {
      "[1]": { trigger: { type: "aura2", unit: "player", debuffType: "HELPFUL", useExactSpellId: true, auraspellids: ["27126"] }, untrigger: {} },
      activeTriggerMode: -10,
    },
  },
};
