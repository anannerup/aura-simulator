/**
 * Plain WeakAuras rules every game has, through the aura core's interface (`auraRules(game).evaluate`): the trigger's
 * "Active" condition, the show options of the triggers the situation models only as present or not, and the texts
 * the sub-elements draw. Each case runs under both games' rules: the addon code they restate is the same in Musca
 * Auras and WeakAuras2.
 */
import { describe, expect, it } from "vitest";
import { auraRules, DEFAULT_SITUATION, previewSituation, TRIGGER_KINDS, withTrigger, type AddonGameId, type AuraDocument, type LuaObject, type Situation } from "@/core";

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

const subtext = (text_text: string, more: LuaObject = {}): LuaObject => ({ type: "subtext", text_text, text_visible: true, ...more });

describe.each(GAMES)("%s: what each text draws (SubText.lua ChangeText, WeakAuras.lua ReplacePlaceHolders)", (game) => {
  const rules = auraRules(game);
  const consumable = icon([{ type: "aura2", unit: "player", auranames: ["Well Fed"], useName: true, matchesShowOn: "showAlways" }, itemCount], {
    subRegions: [{ type: "subbackground" }, subtext("%2.s"), subtext("", { text_visible: false }), subtext("Food")],
    conditions: [
      {
        check: { trigger: 2, variable: "stacks", op: "==", value: "0" },
        changes: [{ property: "sub.2.text_visible", value: false }, { property: "sub.3.text_visible", value: true }],
      },
    ],
  });

  it("formats each sub text with its trigger's values, from the same evaluation the game screen draws", () => {
    const r = rules.evaluate(consumable, situation([2, { present: true, stacks: 8 }]));
    expect(r.texts[2]).toMatchObject({ text: "8", visible: true, customText: false });
    expect(r.texts[3]).toMatchObject({ text: "", visible: false });
    expect(r.texts[4]).toMatchObject({ text: "Food", visible: true });
  });

  it("a condition that only shows an empty text draws nothing; one that changes the text draws the new text", () => {
    expect(rules.evaluate(consumable, situation([2, { present: false }])).texts[3]).toMatchObject({ text: "", visible: true });
    const dash = {
      ...consumable,
      conditions: [
        { check: { trigger: 2, variable: "stacks", op: "==", value: 0 }, changes: [{ property: "sub.3.text_visible", value: true }, { property: "sub.3.text_text", value: "-" }] },
      ],
    };
    expect(rules.evaluate(dash, situation([2, { present: false }])).texts[3]).toMatchObject({ text: "-", visible: true });
  });

  it("custom text (%c, %c2) is not evaluated: it draws a marker and says so", () => {
    const custom = icon([itemCount], { subRegions: [subtext("%c / %c2 left")], customText: "function() return 'x', 'y' end" });
    expect(rules.evaluate(custom, situation([1, { present: true, stacks: 1 }])).texts[1]).toEqual({
      text: "[%c] / [%c2] left",
      visible: true,
      customText: true,
      parts: [{ custom: "c" }, " / ", { custom: "c2" }, " left"],
    });
  });

  it("the preview reports what each text draws, custom text marked as not evaluated", () => {
    const custom = { ...consumable, subRegions: [...(consumable.subRegions as LuaObject[]), subtext("%c")], customText: "function() return 'x' end" };
    const preview = previewSituation({ aura: custom, children: [] }, situation([2, { present: true, stacks: 8 }]), game);
    expect(preview.displays[0].texts).toEqual([
      { subRegion: 2, text: "8", visible: true },
      { subRegion: 3, text: "", visible: false },
      { subRegion: 4, text: "Food", visible: true },
      { subRegion: 5, text: "[%c]", visible: true, customText: "not evaluated" },
    ]);
    const text = previewSituation({ aura: { ...icon([itemCount]), regionType: "text", displayText: "%s left" }, children: [] }, situation([1, { present: true, stacks: 5 }]), game);
    expect(text.displays[0].displayText).toEqual({ text: "5 left" });
  });
});

describe.each(GAMES)("%s: each trigger kind reports its prototype's condition variables (Prototypes.lua)", (game) => {
  const rules = auraRules(game);
  const desaturatedWhen = (trigger: LuaObject, variable: string, value: number, s: Situation) =>
    rules.evaluate(icon([{ ...trigger, genericShowOn: "showAlways", showOn: "showAlways" }], { conditions: [{ check: { trigger: 1, variable, value }, changes: [{ property: "desaturate", value: true }] }] }), s)
      .properties.desaturate;

  it.each([
    ["Cooldown Progress (Item)", { type: "item", event: "Cooldown Progress (Item)", itemName: 22829 }],
    ["Cooldown Progress (Equipment Slot)", { type: "item", event: "Cooldown Progress (Equipment Slot)", itemSlot: 13 }],
  ])("%s: onCooldown while on cooldown", (_name, trigger) => {
    expect(desaturatedWhen(trigger, "onCooldown", 1, situation([1, { present: true, remaining: 30, duration: 120 }]))).toBe(true);
    expect(desaturatedWhen(trigger, "onCooldown", 1, situation([1, { present: false }]))).toBe(false);
    expect(desaturatedWhen(trigger, "onCooldown", 0, situation([1, { present: false }]))).toBe(true);
  });

  it("Weapon Enchant: enchanted while the enchant is on the weapon, with its time and stacks", () => {
    const tench: LuaObject = { type: "item", event: "Weapon Enchant", weapon: "main" };
    expect(desaturatedWhen(tench, "enchanted", 1, situation([1, { present: true }]))).toBe(true);
    expect(desaturatedWhen(tench, "enchanted", 0, situation([1, { present: false }]))).toBe(true);
    expect(desaturatedWhen(tench, "enchanted", 1, situation([1, { present: false }]))).toBe(false);
    const on = rules.evaluate(icon([tench]), situation([1, { present: true, remaining: 600, duration: 1800, stacks: 3 }])).triggers[0];
    expect(on).toMatchObject({ kind: "weaponEnchant", remaining: 600, duration: 1800, stacks: 3 });
  });

  it("the kinds are offered per game, and the item cooldowns follow genericShowOn like the spell's", () => {
    expect(TRIGGER_KINDS[game]).toEqual(expect.arrayContaining(["itemCooldown", "weaponEnchant"]));
    const ready = { type: "item", event: "Cooldown Progress (Item)", itemName: 22829, genericShowOn: "showOnReady" };
    expect(rules.evaluate(icon([ready]), situation([1, { present: true, remaining: 30 }])).triggers[0]).toMatchObject({ kind: "itemCooldown", active: false });
  });
});

describe.each(GAMES)("%s: custom Lua isn't run, and the evaluation says which parts", (game) => {
  const rules = auraRules(game);
  const custom = icon(
    [
      { type: "aura2", unit: "player", auranames: ["Well Fed"], useName: true },
      { type: "custom", custom_type: "stateupdate", custom: "function(allstates) return true end" },
    ],
    {
      subRegions: [subtext("%c")],
      customText: "function() return 'x' end",
      conditions: [
        { check: { trigger: -1, variable: "customcheck", value: "function() return true end" }, changes: [{ property: "desaturate", value: true }] },
        {
          check: { trigger: -2, variable: "AND", checks: [{ trigger: 1, variable: "show", value: 1 }, { trigger: -1, variable: "customcheck", value: "function() return true end" }] },
          changes: [{ property: "customcode", value: { custom: "print(1)" } }],
        },
      ],
      actions: {
        init: { do_custom: true, custom: "aura_env.x = 1" },
        start: { do_custom: true, custom: "print('shown')" },
        finish: { do_custom: false, custom: "print('hidden')" },
      },
      animation: { start: { type: "custom", use_alpha: true, alphaType: "custom", alphaFunc: "function(p) return p end" }, main: { type: "none" }, finish: { type: "none" } },
    },
  );
  const parts = [
    "trigger 2: custom (stateupdate)",
    "condition 1: custom check",
    "condition 2: custom check",
    "condition 2: Run Custom Code",
    "custom text (%c)",
    "On Init custom code",
    "On Show custom code",
    "start animation: custom function",
  ];

  it("lists every custom code part of the aura the simulator doesn't run", () => {
    expect(rules.evaluate(custom, situation()).customCode).toEqual(parts);
    expect(rules.evaluate(icon([itemCount]), situation()).customCode).toEqual([]);
  });

  it("the preview flags them per display; a display without custom code has no flag", () => {
    expect(previewSituation({ aura: custom, children: [] }, situation(), game).displays[0].notEvaluated).toEqual(parts);
    expect(previewSituation({ aura: icon([itemCount]), children: [] }, situation(), game).displays[0]).not.toHaveProperty("notEvaluated");
  });
});
