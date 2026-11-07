/**
 * The situation as agents send it (`readSituation`, the push API's and `auraSimulator.situation`'s form) and what an
 * aura shows in it (`previewSituation`, the push answer's `preview`).
 */
import { describe, expect, test } from "vitest";
import {
  auraRules,
  canonicalize,
  DEFAULT_SITUATION,
  previewSituation,
  readSituation,
  setInCombat,
  situationJson,
  SituationError,
  withAuraTrigger,
  withoutAura,
  type AuraDocument,
} from "@/core";

describe("readSituation", () => {
  test("is a whole situation: what is left out has its default", () => {
    expect(readSituation({}, "tbc")).toEqual(DEFAULT_SITUATION);
    const s = readSituation({ inCombat: true, triggers: { "2": { present: false } } }, "tbc");
    expect(s).toEqual({ targetExists: true, inCombat: true, triggers: { 2: { present: false, remaining: 45, duration: 60, stacks: 0 } } });
  });

  test("keeps time left within the duration and reads back what situationJson writes", () => {
    const s = readSituation({ triggers: { "1": { remaining: 500, duration: 120, stacks: 3 } } }, "forever");
    expect(s.triggers[1]).toEqual({ present: true, remaining: 120, duration: 120, stacks: 3 });
    expect(readSituation(JSON.parse(JSON.stringify(situationJson(s))), "forever")).toEqual(s);
  });

  test("says what is wrong", () => {
    const fails = (value: unknown, game: "forever" | "tbc" = "tbc") => {
      try {
        readSituation(value, game);
      } catch (e) {
        expect(e).toBeInstanceOf(SituationError);
        return (e as Error).message;
      }
      return "accepted";
    };
    expect(fails([])).toMatch(/must be a JSON object/);
    expect(fails({ triggers: { first: {} } })).toMatch(/"first" is not a trigger number/);
    expect(fails({ triggers: { "1": { remaining: -1 } } })).toMatch(/remaining must be a number of at least 0/);
    expect(fails({ triggers: { "1": { left: 3 } } })).toMatch(/left is unknown/);
    expect(fails({ inCombat: "yes" })).toMatch(/inCombat must be true or false/);
    expect(fails({ target: true })).toMatch(/"target" is not part of a situation/);
    // Only Forever has a combat restriction, so only its situations have a moment combat started.
    expect(fails({ inCombat: true, beforeCombat: {} })).toMatch(/only Forever/);
    expect(fails({ inCombat: true, beforeCombat: {} }, "forever")).toBe("accepted");
  });

  test("Forever: beforeCombat is the moment combat started, kept only in combat", () => {
    const s = readSituation({ inCombat: true, triggers: { "1": { present: false } }, beforeCombat: { triggers: { "1": { remaining: 30 } } } }, "forever");
    expect(s.beforeCombat).toEqual({ targetExists: true, inCombat: false, triggers: { 1: { present: true, remaining: 30, duration: 60, stacks: 0 } } });
    expect(readSituation({ beforeCombat: {} }, "forever").beforeCombat).toBeUndefined();
  });
});

describe("a situation per aura (`auras`: overrides by aura id over the workspace-wide one)", () => {
  const counted = (id: string): AuraDocument => ({
    id,
    regionType: "icon",
    subRegions: [{ type: "subtext", text_text: "%1.s" }],
    triggers: { "[1]": { trigger: { type: "item", event: "Item Count", itemName: 27657, use_itemName: true }, untrigger: {} } },
  });

  test("each aura evaluates in its own override; the others in the workspace-wide situation", () => {
    for (const game of ["tbc", "forever"] as const) {
      const s = readSituation({ triggers: { "1": { stacks: 12 } }, auras: { Food: { triggers: { "1": { stacks: 8 } } }, Stone: { triggers: { "1": { present: false } } } } }, game);
      const drawn = (id: string) => auraRules(game).evaluate(counted(id), s).texts[1].text;
      expect([drawn("Food"), drawn("Stone"), drawn("Flask")]).toEqual(["8", "", "12"]);
    }
  });

  test("an override's trigger fields left out come from the workspace-wide trigger; situationJson writes it back", () => {
    const s = readSituation({ triggers: { "1": { present: false, duration: 30 } }, auras: { Food: { triggers: { "1": { stacks: 8 } } } } }, "tbc");
    expect(s.auras).toEqual({ Food: { triggers: { 1: { present: false, remaining: 30, duration: 30, stacks: 8 } } } });
    expect(readSituation(JSON.parse(JSON.stringify(situationJson(s))), "tbc")).toEqual(s);
  });

  test("withAuraTrigger edits one aura's override; withoutAura drops it", () => {
    let s = withAuraTrigger(DEFAULT_SITUATION, "Food", 1, { stacks: 5 });
    expect(s.auras?.Food.triggers[1]).toMatchObject({ present: true, stacks: 5 });
    expect(s.triggers).toEqual({});
    s = withAuraTrigger(s, "Food", 1, { stacks: 1 });
    expect(s.auras?.Food.triggers[1].stacks).toBe(1);
    expect(withoutAura(s, "Food").auras).toBeUndefined();
  });

  test("Forever: entering combat keeps the overrides in the pre-combat snapshot", () => {
    const s = setInCombat(withAuraTrigger(DEFAULT_SITUATION, "Food", 1, { stacks: 5 }), true, "forever");
    expect(s.beforeCombat?.auras?.Food.triggers[1].stacks).toBe(5);
  });

  test("says what is wrong in an override", () => {
    expect(() => readSituation({ auras: [] }, "tbc")).toThrow(/auras must be an object keyed by aura id/);
    expect(() => readSituation({ auras: { Food: { inCombat: true } } }, "tbc")).toThrow(/auras.Food.inCombat is not part of an aura's situation/);
    expect(() => readSituation({ auras: { Food: { triggers: { "1": { stacks: -1 } } } } }, "tbc")).toThrow(/auras.Food.triggers.1.stacks must be a number/);
  });
});

describe("previewSituation", () => {
  const icon = (trigger: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    canonicalize({
      id: "Probe",
      regionType: "icon",
      subRegions: [{ type: "subbackground" }, { type: "subglow", glow: false }],
      triggers: { "[1]": { trigger, untrigger: {} }, activeTriggerMode: -10 },
      conditions: [{ check: { trigger: 1, variable: "expirationTime", op: "<", value: "30" }, changes: [{ property: "sub.2.glow", value: true }] }],
      ...extra,
    } as AuraDocument) as AuraDocument;

  test("says per display whether it is shown, what its triggers report and what conditions changed", () => {
    const aura = icon({ type: "aura2", unit: "player", debuffType: "HELPFUL", auranames: ["Arcane Intellect"], useName: true });
    const p = previewSituation({ aura, children: [] }, readSituation({ triggers: { "1": { remaining: 12.34, duration: 3600 } } }, "tbc"), "tbc");
    expect(p.situation).toMatchObject({ targetExists: true, inCombat: false });
    expect(p.displays).toEqual([
      {
        id: "Probe",
        regionType: "icon",
        shown: true,
        triggers: [{ trigger: 1, active: true, remaining: 12.3, duration: 3600, stacks: 0 }],
        activeConditions: [1],
        changed: { "sub.2.glow": true },
        glows: [{ subRegion: 2, lit: true }],
        texts: [],
      },
    ]);
    const gone = previewSituation({ aura, children: [] }, readSituation({ triggers: { "1": { present: false } } }, "tbc"), "tbc");
    expect(gone.displays[0]).toMatchObject({ shown: false, activeConditions: [], changed: {} });
  });

  test("lists a group's displays, not the group, and on Forever says when one is frozen in combat", () => {
    const aura2 = icon({ type: "aura2", unit: "player", debuffType: "HELPFUL", auranames: ["Arcane Intellect"], useName: true }, { parent: "G" });
    const group = { id: "G", regionType: "group", controlledChildren: ["Probe"] } as AuraDocument;
    const s = readSituation({ inCombat: true, triggers: { "1": { present: false } }, beforeCombat: {} }, "forever");
    const p = previewSituation({ aura: group, children: [aura2] }, s, "forever");
    expect(p.displays.map((d) => d.id)).toEqual(["Probe"]);
    // Forever's aura2 freezes in combat: it still shows the buff it saw when combat started.
    expect(p.displays[0]).toMatchObject({ shown: true, frozen: true });
    expect(previewSituation({ aura: group, children: [aura2] }, readSituation({ inCombat: true, triggers: { "1": { present: false } } }, "tbc"), "tbc").displays[0]).toMatchObject({ shown: false });
  });
});
