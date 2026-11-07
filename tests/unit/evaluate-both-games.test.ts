/**
 * Plain WeakAuras rules every game has, through the aura core's interface (`auraRules(game).evaluate`): the trigger's
 * "Active" condition, the show options of the triggers the situation models only as present or not, and the texts
 * the sub-elements draw. Each case runs under both games' rules: the addon code they restate is the same in Musca
 * Auras and WeakAuras2.
 */
import { describe, expect, it } from "vitest";
import { auraRules, DEFAULT_SITUATION, withTrigger, type AddonGameId, type AuraDocument, type LuaObject, type Situation } from "@/core";

const GAMES: AddonGameId[] = ["tbc", "forever"];

const icon = (triggers: LuaObject[], more: LuaObject = {}): AuraDocument => ({
  id: "Probe",
  regionType: "icon",
  width: 64,
  height: 64,
  anchorPoint: "CENTER",
  selfPoint: "CENTER",
  xOffset: 0,
  yOffset: 0,
  desaturate: false,
  triggers: { ...Object.fromEntries(triggers.map((t, i) => [`[${i + 1}]`, { trigger: t, untrigger: {} }])), disjunctive: "any", activeTriggerMode: -10 },
  ...more,
});

const itemCount: LuaObject = { type: "item", event: "Item Count", itemName: 27657, use_itemName: true };
const situation = (...patches: [number, Parameters<typeof withTrigger>[2]][]): Situation =>
  patches.reduce((s, [i, p]) => withTrigger(s, i, p), DEFAULT_SITUATION as Situation);

describe.each(GAMES)("%s: a trigger's Active condition (WeakAuras.lua GetTriggerConditions: show)", (game) => {
  const rules = auraRules(game);
  const aura = (value: number) =>
    icon([{ type: "aura2", unit: "player", auranames: ["Well Fed"], useName: true, matchesShowOn: "showAlways" }, itemCount], {
      conditions: [{ check: { trigger: 2, variable: "show", value }, changes: [{ property: "desaturate", value: true }] }],
    });

  it("Active == true holds while that trigger is active", () => {
    const r = rules.evaluate(aura(1), situation([2, { present: true, stacks: 3 }]));
    expect(r.activeConditions).toEqual([1]);
    expect(r.properties.desaturate).toBe(true);
  });

  it("Active == false holds while that trigger is not active", () => {
    const counted = icon([{ type: "aura2", unit: "player", auranames: ["Well Fed"], useName: true, matchesShowOn: "showAlways" }, { ...itemCount, use_count: true, count: 1, count_operator: ">=" }], {
      conditions: [{ check: { trigger: 2, variable: "show", value: 0 }, changes: [{ property: "desaturate", value: true }] }],
    });
    expect(rules.evaluate(counted, situation([2, { present: false }])).activeConditions).toEqual([1]);
    expect(rules.evaluate(counted, situation([2, { present: true, stacks: 2 }])).activeConditions).toEqual([]);
  });
});

describe.each(GAMES)("%s: show options of triggers the situation has only as present or not (Prototypes.lua)", (game) => {
  const rules = auraRules(game);
  const active = (trigger: LuaObject, present: boolean, stacks = 0) =>
    rules.evaluate(icon([trigger]), situation([1, { present, stacks }])).triggers[0].active;

  it("genericShowOn (cooldown triggers, e.g. Cooldown Progress (Item)): on cooldown, ready, or always", () => {
    const item = (genericShowOn?: string): LuaObject => ({ type: "item", event: "Cooldown Progress (Item)", itemName: 22829, ...(genericShowOn && { genericShowOn }) });
    expect([active(item(), true), active(item(), false)]).toEqual([true, false]);
    expect([active(item("showOnReady"), true), active(item("showOnReady"), false)]).toEqual([false, true]);
    expect([active(item("showAlways"), true), active(item("showAlways"), false)]).toEqual([true, true]);
  });

  it("showOn (Weapon Enchant): active, missing, or always", () => {
    const tench = (showOn?: string): LuaObject => ({ type: "item", event: "Weapon Enchant", weapon: "main", ...(showOn && { showOn }) });
    expect([active(tench(), true), active(tench(), false)]).toEqual([true, false]);
    expect([active(tench("showOnMissing"), true), active(tench("showOnMissing"), false)]).toEqual([false, true]);
    expect([active(tench("showAlways"), true), active(tench("showAlways"), false)]).toEqual([true, true]);
  });

  it("Inverse (use_inverse, e.g. Totem, Item Equipped): active while the thing is not there", () => {
    const equipped: LuaObject = { type: "item", event: "Item Equipped", itemName: 28830, use_inverse: true };
    expect([active(equipped, true), active(equipped, false)]).toEqual([false, true]);
  });

  it("Item Count: always active, its count is the stacks (0 when not present); a count filter decides", () => {
    const shown = rules.evaluate(icon([itemCount]), situation([1, { present: false, stacks: 8 }]));
    expect(shown.triggers[0]).toMatchObject({ active: true, stacks: 0 });
    expect(rules.evaluate(icon([itemCount]), situation([1, { present: true, stacks: 8 }])).triggers[0]).toMatchObject({ active: true, stacks: 8 });
    const atLeastTwo: LuaObject = { ...itemCount, use_count: true, count: 2, count_operator: ">=" };
    expect([active(atLeastTwo, true, 1), active(atLeastTwo, true, 2), active(atLeastTwo, false, 5)]).toEqual([false, true, false]);
    // The filter's operator defaults to == (GenericTrigger.lua singleTest).
    expect(active({ ...itemCount, use_count: true, count: 3 }, true, 3)).toBe(true);
  });
});
