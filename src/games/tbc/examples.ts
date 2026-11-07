/**
 * TBC's example auras: the documents its agent docs show as worked examples (wago JSON) and the tests push, including
 * the TBC v1 auras (`.scratch/tbc-anniversary/v1-auras/`). Plain data with no imports, so Playwright can load it. Plain
 * WeakAuras2: the regular Aura trigger (`aura2`) and the spell cooldown trigger work the same in and out of combat on
 * TBC Anniversary.
 *
 * Spells (TBC Anniversary IDs): Arcane Intellect (27126, rank 6; matched by name, so every rank and Arcane Brilliance
 * count), Fire Blast (27079, rank 9; the cooldown trigger follows the highest rank the player knows), Corruption
 * (27216, rank 8; matched by name, own casts only).
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

/** An aura document: the addon's table as JSON (`"[1]"` for the number key 1, arrays for sequences). */
type Doc = Record<string, unknown>;

const ICON_BASE: Doc = {
  regionType: "icon",
  width: 64,
  height: 64,
  anchorPoint: "CENTER",
  selfPoint: "CENTER",
  xOffset: 0,
  yOffset: 0,
  cooldown: true,
};

const text = (textText: string, extra: Doc = {}): Doc => ({
  type: "subtext",
  text_text: textText,
  text_color: [1, 1, 1, 1],
  text_font: "Friz Quadrata TT",
  text_fontSize: 14,
  text_fontType: "OUTLINE",
  text_visible: true,
  text_justify: "CENTER",
  text_selfPoint: "AUTO",
  anchor_point: "CENTER",
  text_anchorXOffset: 0,
  text_anchorYOffset: 0,
  ...extra,
});

const glow = (): Doc => ({ type: "subglow", glow: false, glowType: "buttonOverlay", useGlowColor: false });

/** The player's Arcane Intellect (any rank) or Arcane Brilliance, by name. */
const intellectTrigger = (extra: Doc = {}): Doc => ({
  type: "aura2",
  unit: "player",
  debuffType: "HELPFUL",
  useName: true,
  auranames: ["Arcane Intellect", "Arcane Brilliance"],
  ...extra,
});

const one = (trigger: Doc) => ({ "[1]": { trigger, untrigger: {} }, activeTriggerMode: -10 });

/**
 * TBC v1 aura 1a: the buff running low. Shown only while under 3 minutes are left (the trigger's Remaining Time:
 * `useRem`, `remOperator` "<", `rem` "180"), desaturated (a plain display setting), glowing in its last 30 seconds
 * (condition on Remaining Duration, `expirationTime`), its time text red in the last 10.
 */
export const tbcBuffUnderThreeMinutes: Doc = {
  ...ICON_BASE,
  id: "Arcane Intellect under 3 min",
  displayIcon: 135932,
  desaturate: true,
  subRegions: [{ type: "subbackground" }, text("%p"), glow()],
  triggers: one(intellectTrigger({ useRem: true, remOperator: "<", rem: "180" })),
  conditions: [
    { check: { trigger: 1, variable: "expirationTime", op: "<", value: "30" }, changes: [{ property: "sub.3.glow", value: true }] },
    { check: { trigger: 1, variable: "expirationTime", op: "<", value: "10" }, changes: [{ property: "sub.2.text_color", value: [1, 0.2, 0.2, 1] }] },
  ],
};

/** TBC v1 aura 1b: the buff missing. Shown (desaturated, glowing) only while neither buff is on the player. */
export const tbcBuffMissing: Doc = {
  ...ICON_BASE,
  id: "Arcane Intellect missing",
  displayIcon: 135932,
  desaturate: true,
  subRegions: [{ type: "subbackground" }, { ...glow(), glow: true }],
  triggers: one(intellectTrigger({ matchesShowOn: "showOnMissing", use_matchesShowOn: true })),
};

/** TBC v1 aura 2: a cooldown icon, greyed out while Fire Blast is on cooldown, with the game's countdown numbers. */
export const tbcCooldownIcon: Doc = {
  ...ICON_BASE,
  id: "Fire Blast cooldown",
  displayIcon: 135807,
  subRegions: [{ type: "subbackground" }],
  triggers: one({ type: "spell", event: "Cooldown Progress (Spell)", spellName: 27079, genericShowOn: "showAlways", use_genericShowOn: true }),
  conditions: [{ check: { trigger: 1, variable: "onCooldown", value: 1 }, changes: [{ property: "desaturate", value: true }] }],
};

const barText = (textText: string, anchor: string): Doc =>
  text(textText, { anchor_point: anchor, text_justify: anchor === "INNER_LEFT" ? "LEFT" : "RIGHT", text_fontSize: 12, text_anchorXOffset: anchor === "INNER_LEFT" ? 2 : -2 });

/**
 * TBC v1 aura 3: the time left of the player's own Corruption on the target as a bar: name left, time right, the time
 * red under 5 seconds.
 */
export const tbcTargetDebuffBar: Doc = {
  regionType: "aurabar",
  id: "Corruption on target",
  width: 200,
  height: 20,
  anchorPoint: "CENTER",
  selfPoint: "CENTER",
  xOffset: 0,
  yOffset: 0,
  texture: "Blizzard",
  orientation: "HORIZONTAL",
  icon: true,
  icon_side: "LEFT",
  barColor: [0.62, 0.22, 0.85, 1],
  backgroundColor: [0, 0, 0, 0.5],
  spark: true,
  displayIcon: 136118,
  subRegions: [{ type: "subbackground" }, { type: "subforeground" }, barText("%n", "INNER_LEFT"), barText("%p", "INNER_RIGHT")],
  triggers: one({ type: "aura2", unit: "target", debuffType: "HARMFUL", useName: true, auranames: ["Corruption"], ownOnly: true }),
  conditions: [
    { check: { trigger: 1, variable: "expirationTime", op: "<", value: "5" }, changes: [{ property: "sub.4.text_color", value: [1, 0.2, 0.2, 1] }] },
  ],
};

/**
 * TBC v1 aura 4: a group holding 1a, 1b, 2 and 3. The two buff auras share a spot (one shows while under 3 minutes
 * are left, the other while the buff is missing), the cooldown sits to the right and the bar below.
 */
export const tbcV1Group: { aura: Doc; children: Doc[] } = (() => {
  const place = (aura: Doc, xOffset: number, yOffset: number): Doc => ({ ...aura, parent: "TBC v1 auras", xOffset, yOffset });
  const children = [
    place(tbcBuffUnderThreeMinutes, 0, 0),
    place(tbcBuffMissing, 0, 0),
    place(tbcCooldownIcon, 72, 0),
    place(tbcTargetDebuffBar, 36, -56),
  ];
  return {
    aura: {
      id: "TBC v1 auras",
      regionType: "group",
      anchorPoint: "CENTER",
      selfPoint: "CENTER",
      xOffset: 0,
      yOffset: -200,
      controlledChildren: children.map((c) => c.id as string),
    },
    children,
  };
})();

/** The TBC v1 auras by file name (without extension), as written to `.scratch/tbc-anniversary/v1-auras/`. */
export const TBC_V1_AURAS: Record<string, { aura: Doc; children: Doc[] }> = {
  "1a buff under 3 min": { aura: tbcBuffUnderThreeMinutes, children: [] },
  "1b buff missing": { aura: tbcBuffMissing, children: [] },
  "2 cooldown icon": { aura: tbcCooldownIcon, children: [] },
  "3 target debuff bar": { aura: tbcTargetDebuffBar, children: [] },
  "4 v1 group": tbcV1Group,
};
