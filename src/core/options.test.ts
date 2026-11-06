import { beforeAll, describe, expect, test } from "vitest";
import {
  getField,
  loadAddon,
  OptionEditError,
  sampleIconAura,
  type AuraCore,
  type AuraDocument,
  type AuraState,
  type LuaTable,
  type OptionNode,
  type OptionsTree,
} from "@/core";
import { parseOptionTabs } from "@/core/addon-vm/options";
import { cachedAddonFetcher } from "../../tests/support/addon-source";

const REF = "v1.15.0";
const fetchSource = cachedAddonFetcher(REF);
let core: AuraCore;
let sample: AuraState;

beforeAll(async () => {
  core = await loadAddon(REF, { fetchSource });
  await core.loadFullAddon();
  sample = { aura: sampleIconAura(core.internalVersion), children: [] };
}, 120_000);

const single = (aura: AuraDocument): AuraState => ({ aura, children: [] });

function find(tree: OptionsTree, key: string): OptionNode {
  const walk = (n: OptionNode): OptionNode | undefined =>
    n.key === key ? n : (n.args ?? []).map(walk).find((x) => x !== undefined);
  const node = tree.tree && walk(tree.tree);
  if (!node) throw new Error(`no option ${key} in ${tree.tab}${tree.error ? `: ${tree.error}` : ""}`);
  return node;
}

const trigger1 = (aura: AuraDocument) => {
  const triggers = getField(aura, "triggers") as LuaTable;
  return getField(getField(triggers, 1) as LuaTable, "trigger") as AuraDocument;
};

describe("tabs", () => {
  test("the options window's tabs, in the game's order and with its names", async () => {
    const r = await core.options(sample);
    expect(r.tabs.map((t) => t.label)).toEqual([
      "Display",
      "Trigger",
      "Conditions",
      "Actions",
      "Animations",
      "Load",
      "Custom Options",
      "Information",
    ]);
    expect(r.tab).toBe("region");
    expect(r.error).toBeUndefined();
  });

  test("every tab builds for the sample aura", async () => {
    const { tabs } = await core.options(sample);
    for (const tab of tabs) {
      const r = await core.options(sample, { tab: tab.key });
      expect(r.error, tab.label).toBeUndefined();
      expect(r.tree?.args?.length, tab.label).toBeGreaterThan(0);
    }
  });

  test("a group gets the window's Group tab first, and its other tabs build over its children", async () => {
    const src = await fetchSource("WeakAuras/ForeverTutorial.lua");
    const group = [...src.matchAll(/import = "(!WA:2![^"]+)"/g)]
      .map((m) => core.decode(m[1]))
      .find((s) => s.children.length > 0)!;
    const r = await core.options(group);
    expect(r.tabs[0]).toEqual({ key: "group", label: "Group" });
    for (const tab of r.tabs) {
      const t = await core.options(group, { tab: tab.key });
      expect(t.error, tab.label).toBeUndefined();
    }
  });

  test("the tab list is read from the options window's source", () => {
    const src = `
      local optionsGenerator = { group = OptionsPrivate.GetGroupOptions, region = OptionsPrivate.GetDisplayOptions,
        newtab = OptionsPrivate.GetNewOptions, }
      local tabs = {
        { value = "region", text = L["Display"]},
        { value = "newtab", text = L["Brand New"]},
      }
      if data.controlledChildren then
        tinsert(tabs, 1, { value = "group", text = L["Group"]})
      end`;
    expect(parseOptionTabs(src)).toEqual([
      { key: "group", label: "Group", fn: "GetGroupOptions", groupOnly: true },
      { key: "region", label: "Display", fn: "GetDisplayOptions", groupOnly: false },
      { key: "newtab", label: "Brand New", fn: "GetNewOptions", groupOnly: false },
    ]);
  });
});

describe("option trees", () => {
  test("Display: size and desaturate, with values and ranges from the addon", async () => {
    const display = await core.options(sample, { tab: "region" });
    const width = find(display, "position.width");
    expect(width).toMatchObject({ type: "range", name: "Width", value: 64 });
    expect(width.min ?? width.softMin).toBeDefined();
    expect(find(display, "position.height")).toMatchObject({ type: "range", name: "Height", value: 64 });
    expect(find(display, "icon.desaturate")).toMatchObject({ type: "toggle", name: "Desaturate", value: false });
    // Sections the game starts collapsed are collapsed here too.
    expect(width.hidden).toBe(true);
    expect(find(display, "positioncollapseButton")).toMatchObject({ type: "execute", control: "WeakAurasExpand" });
  });

  test("Trigger: Aura (Modern) with its spell IDs and the Remaining Time filter", async () => {
    const trigger = await core.options(sample, { tab: "trigger" });
    const type = find(trigger, "trigger.1.secretAura.type");
    expect(type.type).toBe("select");
    expect(type.value).toBe("secretAura");
    expect(type.values).toContainEqual(["secretAura", "Aura (Modern)"]);
    expect(find(trigger, "trigger.1.secretAura.useSpellIDs").value).toBe(true);
    const spell = find(trigger, "trigger.1.secretAura.spellid1");
    expect(spell.type).toBe("input");
    expect(String(spell.value)).toMatch(/^1459\b/);
    expect(find(trigger, "trigger.1.secretAura.useRem")).toMatchObject({ type: "toggle", name: "Remaining Time", value: false });
    expect(find(trigger, "trigger.1.secretAura.rem").hidden).toBe(true);
  });

  test("Load and Information: plain fields", async () => {
    expect(find(await core.options(sample, { tab: "load" }), "use_combat")).toMatchObject({ type: "toggle", name: "In Combat" });
    expect(find(await core.options(sample, { tab: "information" }), "name")).toMatchObject({ type: "input", value: "Arcane Intellect" });
  });
});

describe("setOption", () => {
  test("changing the width changes only the width", async () => {
    const edit = await core.setOption(sample, { tab: "region", path: ["position.width"] }, 100);
    expect(edit.changed).toBe(true);
    expect(edit.aura).toEqual({ ...sample.aura, width: 100 });
  });

  test("toggling Remaining Time sets secretUseRem, and the hidden operator and value appear", async () => {
    const edit = await core.setOption(sample, { tab: "trigger", path: ["trigger.1.secretAura.useRem"] }, true);
    expect(trigger1(edit.aura).secretUseRem).toBe(true);
    const trigger = await core.options(single(edit.aura), { tab: "trigger" });
    expect(find(trigger, "trigger.1.secretAura.useRem").value).toBe(true);
    expect(find(trigger, "trigger.1.secretAura.rem").hidden).toBe(false);
    expect(find(trigger, "trigger.1.secretAura.remOperator").hidden).toBe(false);
  });

  test("disabled follows other values: the custom glow colour needs Use Custom Color", async () => {
    let state = single(structuredClone(sample.aura));
    state.aura = (await core.setOption(state, { tab: "region", path: ["sub.subglow"] })).aura;
    let display = await core.options(state, { tab: "region" });
    expect(find(display, "sub.2.subglow.glowColor").disabled).toBe(true);
    state = single((await core.setOption(state, { tab: "region", path: ["sub.2.subglow.useGlowColor"] }, true)).aura);
    display = await core.options(state, { tab: "region" });
    expect(find(display, "sub.2.subglow.glowColor").disabled).toBe(false);
    const colour = await core.setOption(state, { tab: "region", path: ["sub.2.subglow.glowColor"] }, [1, 0, 0, 1]);
    expect((colour.aura.subRegions as AuraDocument[])[1].glowColor).toEqual([1, 0, 0, 1]);
  });

  test("expanding a section is not an edit of the aura", async () => {
    const edit = await core.setOption(sample, { tab: "region", path: ["positioncollapseButton"] });
    expect(edit.changed).toBe(false);
    expect(edit.aura).toEqual(sample.aura);
    expect(find(await core.options(sample, { tab: "region" }), "position.width").hidden).toBe(false);
    await core.setOption(sample, { tab: "region", path: ["positioncollapseButton"] });
  });

  test("adds a glow and a remaining-time condition that shows it, with the addon's own buttons", async () => {
    let state = single(structuredClone(sample.aura));
    const apply = async (tab: string, path: string[], value?: unknown) => {
      const edit = await core.setOption(state, { tab, path }, value);
      expect(edit.warning, path.join("/")).toBeUndefined();
      state = single(edit.aura);
    };
    await apply("region", ["sub.subglow"]);
    await apply("conditions", ["addCondition"]);
    expect(state.aura.conditions).toHaveLength(1);

    let conditions = await core.options(state, { tab: "conditions" });
    // Condition option keys hold tostring(table); they are addressed by their normalised key.
    const check = find(conditions, "condition1@if");
    const secondsLeft = check.values!.find(([, label]) => label.trim() === "Seconds left")!;
    await apply("conditions", ["condition1@if"], secondsLeft[0]);
    await apply("conditions", ["condition1@_value"], "5");

    conditions = await core.options(state, { tab: "conditions" });
    const property = find(conditions, "condition1property1");
    const glow = property.values!.find(([, label]) => /Glow 1/.test(label) && /Visibility/.test(label))!;
    expect(glow).toBeDefined();
    await apply("conditions", ["condition1property1"], glow[0]);
    conditions = await core.options(state, { tab: "conditions" });
    await apply("conditions", ["condition1value1"], true);

    const [condition] = state.aura.conditions as AuraDocument[];
    expect(condition.check).toMatchObject({ trigger: 1, variable: "faAuraRemaining", value: "5" });
    expect((condition.changes as AuraDocument[])[0]).toMatchObject({ property: "sub.2.glow", value: true });
    const result = await core.validate(state);
    expect(result.errors).toEqual([]);
    expect(result.combat.status).toBe("ok");
  });

  test("a value the addon refuses is an OptionEditError and leaves the aura alone", async () => {
    const err = await core
      .setOption(sample, { tab: "region", path: ["no.such.option"] }, 1)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe(OptionEditError.name);
  });
});
