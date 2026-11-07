/**
 * TBC's situation and condition rules through the aura core's interface (`@/core`): plain WeakAuras2, no combat
 * restriction. Each display type with an "Aura" (aura2) trigger, in and out of combat: nothing freezes, conditions
 * follow the live situation, no padlock. The same documents under Forever's rules freeze (the contrast cases), so
 * the tests show the games' rules really differ. Forever's own cases are in conditions.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  auraRules,
  auraTriggers,
  DEFAULT_SITUATION,
  evaluateAura,
  evaluateTbcAura,
  setInCombat,
  TRIGGER_KINDS,
  withTrigger,
  type AuraDocument,
  type LuaObject,
  type Situation,
  type TriggerSituation,
} from "@/core";

const tbc = auraRules("tbc");
const forever = auraRules("forever");

/** An aura2 trigger by exact spell ID on the target (Lifebloom): the kind Forever freezes in combat. */
const lifebloom = (more: LuaObject = {}): LuaObject => ({
  type: "aura2",
  unit: "target",
  debuffType: "HELPFUL",
  useExactSpellId: true,
  auraspellids: ["33763"],
  ownOnly: true,
  ...more,
});

/** Each display type with the property a colour condition changes on it (RegionTypes/*.lua properties). */
const DISPLAYS: { regionType: string; colorProperty: string; extra: LuaObject }[] = [
  { regionType: "icon", colorProperty: "color", extra: { width: 64, height: 64 } },
  { regionType: "aurabar", colorProperty: "barColor", extra: { width: 200, height: 20, barColor: [0, 1, 0, 1] } },
  { regionType: "text", colorProperty: "color", extra: { displayText: "%p" } },
  { regionType: "texture", colorProperty: "color", extra: { width: 64, height: 64 } },
  { regionType: "progresstexture", colorProperty: "foregroundColor", extra: { width: 64, height: 64 } },
];

const RED = [1, 0, 0, 1];

/** A display shown while Lifebloom is on the target: red under 5 s left, faded in combat, larger icon at 3 stacks. */
function display(regionType: string, colorProperty: string, extra: LuaObject): AuraDocument {
  return {
    id: `Lifebloom ${regionType}`,
    regionType,
    anchorPoint: "CENTER",
    selfPoint: "CENTER",
    xOffset: 0,
    yOffset: 0,
    ...extra,
    triggers: { "[1]": { trigger: lifebloom(), untrigger: {} }, activeTriggerMode: -10 },
    conditions: [
      { check: { trigger: 1, variable: "expirationTime", op: "<", value: 5 }, changes: [{ property: colorProperty, value: RED }] },
      { check: { trigger: -1, variable: "incombat", value: 1 }, changes: [{ property: "alpha", value: 0.5 }] },
      { check: { trigger: 1, variable: "stacks", op: ">=", value: 3 }, changes: [{ property: "desaturate", value: true }] },
    ],
  };
}

const sit = (t: Partial<TriggerSituation> = {}, extra: Partial<Situation> = {}): Situation =>
  withTrigger({ ...DEFAULT_SITUATION, ...extra }, 1, t);

describe.each(DISPLAYS)("TBC: $regionType with an aura2 trigger", ({ regionType, colorProperty, extra }) => {
  const aura = display(regionType, colorProperty, extra);

  it("out of combat: shown while the aura is up, conditions follow time left and stacks", () => {
    const up = tbc.evaluate(aura, sit({ present: true, remaining: 45, duration: 60, stacks: 1 }));
    expect(up.shown).toBe(true);
    expect(up.activeConditions).toEqual([]);
    expect(up.properties.alpha).toBe(1);
    expect(up.dynamic?.remaining).toBe(45);

    const late = tbc.evaluate(aura, sit({ present: true, remaining: 3, duration: 60, stacks: 3 }));
    expect(late.activeConditions).toEqual([1, 3]);
    expect(late.properties[colorProperty]).toEqual(RED);
    expect(late.properties.desaturate).toBe(true);

    expect(tbc.evaluate(aura, sit({ present: false })).shown).toBe(false);
  });

  it("in combat: nothing freezes; the trigger and its conditions follow the live situation, no padlock", () => {
    const before = sit({ present: true, remaining: 45, duration: 60 });
    let s = tbc.setInCombat(before, true);
    expect(s.beforeCombat).toBeUndefined();

    s = withTrigger(s, 1, { remaining: 3 });
    const late = tbc.evaluate(aura, s);
    expect(late.shown).toBe(true);
    expect(late.frozenMarker).toBe(false);
    expect(late.triggers[0].frozen).toBe(false);
    expect(late.heldInCombat).toEqual([]);
    expect(late.dynamic?.remaining).toBe(3);
    expect(late.activeConditions).toEqual([1, 2]);
    expect(late.properties[colorProperty]).toEqual(RED);
    expect(late.properties.alpha).toBe(0.5);

    const gone = tbc.evaluate(aura, withTrigger(s, 1, { present: false }));
    expect(gone.shown).toBe(false);

    const out = tbc.evaluate(aura, tbc.setInCombat(withTrigger(s, 1, { remaining: 40 }), false));
    expect(out.activeConditions).toEqual([]);
    expect(out.properties.alpha).toBe(1);
  });

  it("contrast: under Forever's rules the same aura freezes in combat (padlock, pre-combat state)", () => {
    let s = forever.setInCombat(sit({ present: true, remaining: 45, duration: 60 }), true);
    s = withTrigger(s, 1, { remaining: 3 });
    const frozen = forever.evaluate(aura, s);
    expect(frozen.frozenMarker).toBe(true);
    expect(frozen.triggers[0].frozen).toBe(true);
    expect(frozen.dynamic?.remaining).toBe(45);
    expect(frozen.activeConditions).toEqual([2]);
    expect(forever.evaluate(aura, withTrigger(s, 1, { present: false })).shown).toBe(true);
  });
});

describe("TBC: rules that are Forever's only don't apply", () => {
  it("auraRules('tbc') is plain WeakAuras2: no combat restriction, no Aura (Modern) trigger kind", () => {
    expect(tbc.combatRestricted).toBe(false);
    expect(tbc.triggerKinds).toEqual(TRIGGER_KINDS.tbc);
    expect(tbc.triggerKinds).not.toContain("secretAura");
    expect(forever.combatRestricted).toBe(true);
    expect(forever.triggerKinds).toContain("secretAura");
  });

  it("a secretAura trigger is an unknown ('other') trigger on TBC, with no native rules or faAura variables", () => {
    const aura: AuraDocument = {
      id: "Modern",
      regionType: "icon",
      triggers: { "[1]": { trigger: { type: "secretAura", unit: "player", secretShowOn: "showOnMissing" } }, activeTriggerMode: -10 },
      conditions: [{ check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: 5 }, changes: [{ property: "desaturate", value: true }] }],
    };
    expect(auraTriggers(aura, "tbc").map((t) => t.kind)).toEqual(["other"]);
    expect(tbc.auraTriggers(aura).map((t) => t.kind)).toEqual(["other"]);
    expect(auraTriggers(aura).map((t) => t.kind)).toEqual(["secretAura"]);
    // "Other" triggers are active while present; the native condition is never true in the generic code.
    const state = evaluateTbcAura(aura, sit({ present: true, remaining: 2, duration: 10 }));
    expect(state.shown).toBe(true);
    expect(state.missing).toBe(false);
    expect(state.activeConditions).toEqual([]);
    expect(state.properties.desaturate).toBe(false);
    expect(state.nativeStackText).toEqual({});
  });

  it("'Desaturate while on cooldown' is Musca's: ignored on TBC, applied on Forever", () => {
    const aura: AuraDocument = {
      id: "Cooldown",
      regionType: "icon",
      triggers: {
        "[1]": { trigger: { type: "spell", event: "Cooldown Progress (Spell)", genericShowOn: "showAlways", use_desaturateOnCooldown: true } },
        activeTriggerMode: -10,
      },
    };
    const onCooldown = sit({ present: true, remaining: 5, duration: 8 });
    expect(evaluateTbcAura(aura, onCooldown).properties.desaturate).toBe(false);
    expect(evaluateAura(aura, onCooldown).properties.desaturate).toBe(true);
  });

  it("entering combat on TBC records no pre-combat snapshot; Forever's does", () => {
    const s = sit({ present: true });
    expect(setInCombat(s, true, "tbc")).toEqual({ triggers: s.triggers, targetExists: true, inCombat: true });
    expect(setInCombat(s, true).beforeCombat).toBeDefined();
  });
});
