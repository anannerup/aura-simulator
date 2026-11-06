import { describe, expect, it } from "vitest";
import type { AuraDocument } from "@/core";
import {
  buffMissing,
  buffRunningLow,
  cooldownIcon,
  remainingDesaturates,
  secretWithCombatCondition,
  targetDebuffAura2,
} from "../examples";
import { DEFAULT_SITUATION, setInCombat, withTrigger, type Situation, type TriggerSituation } from "../situation";
import { formatSubText, formatTime } from "../text-format";
import { evaluateAura } from "./evaluate";
import { aura2Freezes, canFreeze, validateSecretConditions } from "./forever-rules";

const sit = (t: Partial<TriggerSituation> = {}, extra: Partial<Situation> = {}): Situation =>
  withTrigger({ ...DEFAULT_SITUATION, ...extra }, 1, t);

describe("Aura (Modern) trigger state (SecretAuraSingle.lua:110-149)", () => {
  const withShowOn = (secretShowOn: string, more = {}): AuraDocument => ({
    ...buffRunningLow,
    conditions: [],
    triggers: { "[1]": { trigger: { type: "secretAura", unit: "player", secretShowOn, ...more } }, activeTriggerMode: -10 },
  });
  it.each([
    ["showOnActive", true, true, false],
    ["showOnActive", false, false, false],
    ["showOnMissing", true, false, false],
    ["showOnMissing", false, true, true],
    ["showAlways", true, true, false],
    ["showAlways", false, true, true],
    ["bogus", true, true, false],
  ])("Show On %s, present %s -> shown %s, missing button %s", (showOn, present, shown, missing) => {
    const state = evaluateAura(withShowOn(showOn), sit({ present }));
    expect(state.shown).toBe(shown);
    expect(state.missing).toBe(missing);
  });

  it.each([
    ["<", 30, 20, true],
    ["<", 30, 40, false],
    [">=", 30, 30, true],
    [">", 30, 30, false],
  ])("Remaining Time window %s %d at %d s left -> shown %s", (op, rem, remaining, shown) => {
    const aura = withShowOn("showOnActive", { secretUseRem: true, secretRemOperator: op, secretRem: rem });
    expect(evaluateAura(aura, sit({ remaining, duration: 60 })).shown).toBe(shown);
  });

  it("the window is ignored unless Show On is Aura(s) Found (:121-123)", () => {
    const aura = withShowOn("showAlways", { secretUseRem: true, secretRemOperator: "<", secretRem: 5 });
    expect(evaluateAura(aura, sit({ remaining: 50 })).shown).toBe(true);
  });

  it("the missing button has no cooldown swipe but the found one does", () => {
    const missing = evaluateAura(withShowOn("showAlways"), sit({ present: false }));
    expect(missing.missing).toBe(true);
    const found = evaluateAura(withShowOn("showAlways"), sit({ present: true, remaining: 20, duration: 60 }));
    expect(found.dynamic?.remaining).toBe(20);
  });
});

describe("Aura (Modern) native conditions", () => {
  it.each([
    // remaining, glow on, text colour
    [300, false, [1, 1, 1, 1]],
    [170, true, [1, 1, 1, 1]],
    [9, true, [1, 0, 0, 1]],
  ])("buff running low at %d s: glow %s, %%p colour %j", (remaining, glowOn, color) => {
    const state = evaluateAura(buffRunningLow, sit({ remaining, duration: 3600 }));
    expect(state.glows[0].visible).toBe(glowOn);
    expect(state.properties["sub.1.text_color"]).toEqual(color);
    expect(state.properties.desaturate).toBe(true);
  });

  it.each([false, true])("faAuraRemaining glow and text rules keep working in combat (%s)", (inCombat) => {
    const s = setInCombat(sit({ remaining: 100, duration: 3600 }), inCombat);
    const state = evaluateAura(buffRunningLow, withTrigger(s, 1, { remaining: 5 }));
    expect(state.glows[0].visible).toBe(true);
    expect(state.properties["sub.1.text_color"]).toEqual([1, 0, 0, 1]);
  });

  it.each([false, true])("faAuraMissing desaturates and lights the glow on the missing button (in combat: %s)", (inCombat) => {
    const state = evaluateAura(buffMissing, setInCombat(sit({ present: false }), inCombat));
    expect(state.shown).toBe(true);
    expect(state.properties.desaturate).toBe(true);
    expect(state.glows[0].visible).toBe(true);
  });

  it("faAuraRemaining may not drive desaturate: a problem, and it never applies", () => {
    expect(validateSecretConditions(remainingDesaturates)?.message).toMatch(/supported property/);
    for (const inCombat of [false, true]) {
      const state = evaluateAura(remainingDesaturates, setInCombat(sit({ remaining: 3, duration: 60 }), inCombat));
      expect(state.problem?.condition).toBe(1);
      expect(state.properties.desaturate).toBe(false);
    }
  });

  it.each([
    [{ trigger: 1, variable: "faAuraRemaining", op: ">", value: 3 }, /time checks/],
    [{ trigger: 1, variable: "faAuraMissing" }, /Show On/],
    [{ trigger: 1, variable: "buffed", value: 1 }, /cannot use/],
  ])("validation of %j", (check, message) => {
    const aura = { ...buffRunningLow, conditions: [{ check, changes: [{ property: "sub.2.glow", value: true }] }] };
    expect(validateSecretConditions(aura)?.message).toMatch(message);
  });

  it("linking a native condition is a grouping problem", () => {
    const aura: AuraDocument = {
      ...buffRunningLow,
      conditions: [
        { check: { trigger: 1, variable: "faAuraRemaining", op: "<", value: 5 }, changes: [] },
        { linked: true, check: { trigger: -1, variable: "incombat", value: 1 }, changes: [] },
      ],
    };
    expect(validateSecretConditions(aura)?.message).toMatch(/AND, OR or Else If/);
  });

  it("generic changes to native-display properties hold their pre-combat value in combat (SecretAuraConditions.lua:1087)", () => {
    const out = evaluateAura(secretWithCombatCondition, sit());
    expect(out.properties.desaturate).toBe(false);
    const inCombat = evaluateAura(secretWithCombatCondition, setInCombat(sit(), true));
    expect(inCombat.activeConditions).toEqual([1]);
    expect(inCombat.properties.desaturate).toBe(false);
    expect(inCombat.heldInCombat).toContain("desaturate");
  });

  it.each([
    [0, ""],
    [1, ""],
    [2, "2"],
    [5, "5"],
  ])("native stack text shows from 2 stacks on (%d -> %j, StackTextFor :735)", (stacks, text) => {
    const aura = { ...buffRunningLow, conditions: [], subRegions: [{ type: "subtext", text_text: "%s" }] };
    expect(evaluateAura(aura, sit({ stacks })).nativeStackText[1]).toBe(text);
  });

  it("stack rules recolour the stack text", () => {
    const aura = {
      ...buffRunningLow,
      subRegions: [{ type: "subtext", text_text: "%s", text_color: [1, 1, 1, 1] }],
      conditions: [{ check: { trigger: 1, variable: "faAuraApplications", op: ">=", value: 3 }, changes: [{ property: "sub.1.text_color", value: [0, 1, 0, 1] }] }],
    };
    expect(evaluateAura(aura, sit({ stacks: 2 })).properties["sub.1.text_color"]).toEqual([1, 1, 1, 1]);
    const three = evaluateAura(aura, sit({ stacks: 3 }));
    expect(three.properties["sub.1.text_color"]).toEqual([0, 1, 0, 1]);
    expect(three.nativeStackText[1]).toBe("3");
  });
});

describe("aura2 freezing (BuffTrigger2.lua:3376, FrozenMarker.lua:15)", () => {
  it.each([
    [{ useExactSpellId: true, auraspellids: ["116"] }, true],
    [{ useName: true, auranames: ["Frostbolt"] }, true],
    [{ useNativeFilter: true, nativeFilter: { PLAYER: true } }, false],
    [{ useNativeFilter: true, nativeFilter: { PLAYER: true }, useExactSpellId: true, auraspellids: ["116"] }, true],
    [{ useNativeFilter: true, nativeFilter: { PLAYER: true }, useStacks: true, stacks: 2 }, true],
    [{ useNativeFilter: true, nativeFilter: { PLAYER: true }, fetchTooltip: true }, true],
    [{ useNativeFilter: true, nativeFilter: { PLAYER: true }, matchesShowOn: "showOnMissing" }, true],
    [{}, true],
  ])("%j freezes: %s", (trigger, freezes) => {
    expect(aura2Freezes({ type: "aura2", unit: "player", ...trigger })).toBe(freezes);
  });

  it("Aura (Modern) and spell cooldown auras never freeze", () => {
    expect(canFreeze(buffRunningLow)).toBe(false);
    expect(canFreeze(cooldownIcon)).toBe(false);
    expect(canFreeze(targetDebuffAura2)).toBe(true);
  });

  it("a frozen aura2 keeps its pre-combat state and shows the padlock", () => {
    const before = sit({ present: true, remaining: 20, duration: 30, stacks: 4 });
    const combat = withTrigger(setInCombat(before, true), 1, { present: false, stacks: 1 });
    const state = evaluateAura(targetDebuffAura2, combat);
    expect(state.shown).toBe(true);
    expect(state.frozenMarker).toBe(true);
    expect(state.dynamic?.stacks).toBe(4);
    expect(state.properties.color).toEqual([1, 0.3, 0.3, 1]);
    // Out of combat the same facts hide it, and there's no padlock.
    const out = evaluateAura(targetDebuffAura2, setInCombat(combat, false));
    expect(out.shown).toBe(false);
  });

  it("hideFrozenMarker hides the padlock", () => {
    const state = evaluateAura({ ...targetDebuffAura2, hideFrozenMarker: true }, setInCombat(sit(), true));
    expect(state.frozenMarker).toBe(false);
  });

  it("no target hides a target aura", () => {
    expect(evaluateAura(targetDebuffAura2, sit({}, { targetExists: false })).shown).toBe(false);
  });
});

describe("generic conditions (Conditions.lua)", () => {
  it.each([
    [{ stacks: 2, remaining: 20 }, [], [1, 1, 1, 1], 1],
    [{ stacks: 3, remaining: 20 }, [1], [1, 0.3, 0.3, 1], 1],
    [{ stacks: 3, remaining: 4 }, [1, 2], [1, 0.3, 0.3, 1], 0.5],
    [{ stacks: 0, remaining: 4.99 }, [2], [1, 1, 1, 1], 0.5],
  ])("%j -> active %j, colour %j, alpha %d", (t, active, color, alpha) => {
    const state = evaluateAura(targetDebuffAura2, sit({ duration: 30, ...t }));
    expect(state.activeConditions).toEqual(active);
    expect(state.properties.color).toEqual(color);
    expect(state.properties.alpha).toBe(alpha);
  });

  const twoConditions = (linked: boolean): AuraDocument => ({
    ...targetDebuffAura2,
    conditions: [
      { check: { trigger: 1, variable: "stacks", op: ">=", value: 1 }, changes: [{ property: "alpha", value: 0.8 }] },
      { linked, check: { trigger: 1, variable: "stacks", op: ">=", value: 2 }, changes: [{ property: "alpha", value: 0.3 }] },
    ],
  });
  it("the later active condition overrides the earlier one", () => {
    expect(evaluateAura(twoConditions(false), sit({ stacks: 2 })).properties.alpha).toBe(0.3);
  });
  it("a linked (Else If) condition only runs when the one before failed", () => {
    expect(evaluateAura(twoConditions(true), sit({ stacks: 2 })).properties.alpha).toBe(0.8);
    expect(evaluateAura(twoConditions(true), sit({ stacks: 2 })).activeConditions).toEqual([1]);
  });

  it.each([
    ["==", 10, 10.02, true],
    ["==", 10, 10.1, false],
    ["<=", 10, 10, true],
    [">", 10, 10, false],
  ])("timer %s %d at %d s", (op, value, remaining, on) => {
    const aura = { ...targetDebuffAura2, conditions: [{ check: { trigger: 1, variable: "expirationTime", op, value }, changes: [{ property: "alpha", value: 0.2 }] }] };
    expect(evaluateAura(aura, sit({ remaining, duration: 30 })).activeConditions.length > 0).toBe(on);
  });

  it("AND / OR combine checks, global incombat and hastarget", () => {
    const aura = {
      ...cooldownIcon,
      conditions: [
        {
          check: { variable: "AND", checks: [{ trigger: -1, variable: "incombat", value: 1 }, { trigger: -1, variable: "hastarget", value: 1 }] },
          changes: [{ property: "alpha", value: 0.4 }],
        },
      ],
    };
    expect(evaluateAura(aura, sit()).properties.alpha).toBe(1);
    expect(evaluateAura(aura, setInCombat(sit(), true)).properties.alpha).toBe(0.4);
    expect(evaluateAura(aura, setInCombat(sit({}, { targetExists: false }), true)).properties.alpha).toBe(1);
  });
});

describe("spell cooldown trigger (Prototypes.lua:4254)", () => {
  it.each([
    [true, 5, true],
    [false, 0, false],
  ])("on cooldown %s -> desaturated %s", (present, remaining, desaturated) => {
    const state = evaluateAura(cooldownIcon, sit({ present, remaining, duration: 8 }));
    expect(state.shown).toBe(true);
    expect(state.properties.desaturate).toBe(desaturated);
  });

  it("keeps working in combat", () => {
    const state = evaluateAura(cooldownIcon, withTrigger(setInCombat(sit({ present: false }), true), 1, { present: true, remaining: 4 }));
    expect(state.properties.desaturate).toBe(true);
    expect(state.frozenMarker).toBe(false);
  });

  it.each([
    ["showOnCooldown", true, true],
    ["showOnCooldown", false, false],
    ["showOnReady", true, false],
    ["showOnReady", false, true],
  ])("genericShowOn %s, on cooldown %s -> shown %s", (genericShowOn, present, shown) => {
    const aura = {
      ...cooldownIcon,
      triggers: { "[1]": { trigger: { type: "spell", event: "Cooldown Progress (Spell)", genericShowOn } } },
    };
    expect(evaluateAura(aura, sit({ present, remaining: present ? 3 : 0, duration: 8 })).shown).toBe(shown);
  });

  it("Desaturate while on cooldown (use_desaturateOnCooldown)", () => {
    const aura = {
      ...cooldownIcon,
      conditions: [],
      triggers: { "[1]": { trigger: { type: "spell", event: "Cooldown Progress (Spell)", genericShowOn: "showAlways", use_desaturateOnCooldown: true } } },
    };
    expect(evaluateAura(aura, sit({ present: true, remaining: 3 })).properties.desaturate).toBe(true);
    expect(evaluateAura(aura, sit({ present: false, remaining: 0 })).properties.desaturate).toBe(false);
  });
});

describe("text formatting (Types.lua:355-470, dynamic_texts)", () => {
  it.each([
    [0, ""],
    [4.25, "4.3"],
    [59.95, "60.0"],
    [60.2, "1:01"],
    [125, "2:05"],
    [3600, "60:00"],
  ])("%p of %d s -> %j", (value, text) => {
    expect(formatTime(value)).toBe(text);
  });

  it("precision and threshold come from the sub-region's format options", () => {
    const state = evaluateAura(targetDebuffAura2, sit({ remaining: 12.34, duration: 30 }));
    const states = new Map([[0, state.dynamic]]);
    const element = { type: "subtext", text_text: "%p | %s | %%", text_text_format_p_time_precision: 2, text_text_format_p_time_dynamic_threshold: 20 };
    expect(formatSubText(element, { states, name: "x" })).toBe("12.34 |  | %");
  });
});
