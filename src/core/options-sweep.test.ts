/**
 * The tab sweep at seam A: for every display type the addon offers (made by its own New Aura code) and every tab of
 * the options window, walks the addon's option tree generically and sets every editable option once (toggle flipped,
 * another choice, a value inside the range, a colour, text), each from the new aura, and runs every button. An option
 * the editor shows must build, take a value through its own set() and show that value again. Being generic, it
 * covers options a new addon version adds.
 */
import { beforeAll, describe, expect, test } from "vitest";
import { loadAddon, type AuraCore, type AuraDocument, type AuraState, type OptionNode } from "@/core";
import { cachedAddonFetcher } from "../../tests/support/addon-source";
import { sweepValue, walkOptions } from "../../tests/support/options-sweep";

const REF = "v1.15.0";
let core: AuraCore;
const TYPES = ["icon", "aurabar", "text", "texture", "progresstexture", "stopmotion", "model", "empty", "group", "dynamicgroup"];

beforeAll(async () => {
  core = await loadAddon(REF, { fetchSource: cachedAddonFetcher(REF) });
  await core.loadFullAddon();
}, 120_000);

async function newState(regionType: string): Promise<AuraState> {
  const aura = await core.newAura(regionType);
  if (regionType !== "group" && regionType !== "dynamicgroup") return { aura: { ...aura, id: "Sweep" }, children: [] };
  const child = { ...(await core.newAura("icon")), id: "Sweep child", parent: "Sweep" };
  return { aura: { ...aura, id: "Sweep", controlledChildren: ["Sweep child"] }, children: [child] };
}

/** Every option of a tab, with the collapsed sections expanded (as a user would open them). */
async function expandedTree(state: AuraState, tab: string) {
  const opened = new Set<string>();
  for (let round = 0; round < 6; round++) {
    const r = await core.options(state, { tab });
    if (r.error) throw new Error(`${tab}: ${r.error}`);
    const closed = walkOptions(r.tree!).filter(
      (n) => n.type === "execute" && /^WeakAurasExpand/.test(n.control ?? "") && /expand$/.test(n.image ?? "") && !n.hidden,
    );
    const next = closed.find((n) => !opened.has(n.path.join("/")));
    if (!next) return r.tree!;
    opened.add(next.path.join("/"));
    await core.setOption(state, { tab, path: next.path });
  }
  return (await core.options(state, { tab })).tree!;
}

const editable = (n: OptionNode) =>
  !n.hidden && !n.disabled && !n.errors?.get && n.canSet === true && ["toggle", "input", "range", "select", "multiselect", "color"].includes(n.type);

/** The option shows the value it was given (numbers to the precision the form shows). */
function shownAgain(node: OptionNode, given: unknown, shown: unknown): boolean {
  const close = (a: unknown, b: unknown) => typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-6 : a === b;
  // Action-like options (a group's Distribute/Space) have no get(): they never show a value, in the game neither.
  if (node.value === undefined && shown === undefined) return true;
  switch (node.type) {
    case "toggle":
      return !!given === (shown !== undefined && shown !== null && shown !== false);
    case "range":
    case "select":
      return close(given, shown);
    case "color":
      return Array.isArray(shown) && (given as number[]).every((v, i) => close(v, shown[i]) || (node.hasAlpha === false && i === 3));
    case "multiselect": {
      const [key, checked] = given as [unknown, boolean];
      return Array.isArray(shown) && (shown as [unknown, boolean][]).some(([k, v]) => k === key && v === checked);
    }
  }
  return true;
}

/**
 * Errors the addon's own code raises in the game too (bugs to report upstream, not simulator problems):
 * - Prototypes.lua "Item Bonus Id Equipped" formats trigger.itemSlot with %d while it is still unset.
 */
const KNOWN_ADDON_ERRORS = [/bad argument #5 to 'format' \(number expected, got nil\)[\s\S]*Prototypes\.lua/];

interface SweepResult {
  problems: string[];
  mismatches: string[];
  edited: number;
}

/** Sets every editable option of one tab once, each from `base`. */
async function sweepTab(base: AuraState, tab: string, out: SweepResult, label = "") {
  const tree = await expandedTree(base, tab);
  for (const node of walkOptions(tree).filter(editable)) {
    let value = sweepValue(node);
    if (value === undefined) continue;
    const where = `${label}${tab} ${node.path.join("/")} (${node.type} "${node.name ?? ""}")`;
    try {
      const edit = await core.setOption(base, { tab, path: node.path }, value).catch((e: unknown) => {
        // The addon refuses text in a number field (its validate()): the form shows that refusal. Try a number.
        if (node.type !== "input" || !(e instanceof Error) || e.name !== "OptionEditError") throw e;
        value = "5";
        return core.setOption(base, { tab, path: node.path }, value);
      });
      out.edited++;
      if (edit.warning && !KNOWN_ADDON_ERRORS.some((r) => r.test(edit.warning!))) out.problems.push(`${where}: addon error ${edit.warning}`);
      if (!edit.changed) continue; // e.g. an input the addon normalises back
      const after = await core.options({ aura: edit.aura, children: edit.children ?? base.children }, { tab });
      if (after.error) out.problems.push(`${where}: tab no longer builds: ${after.error}`);
      const shown = after.tree && walkOptions(after.tree).find((n) => n.path.join("/") === node.path.join("/"));
      if (shown && !shown.hidden && !shownAgain(node, value, shown.value)) {
        out.mismatches.push(`${where}: set ${JSON.stringify(value)}, shows ${JSON.stringify(shown.value)}`);
      }
    } catch (e) {
      out.problems.push(`${where}: ${(e as Error).message}`);
    }
  }
}

/** Runs every button of one tab once, each from `base`. */
async function pressAll(base: AuraState, tab: string, out: SweepResult, label = "") {
  const tree = await expandedTree(base, tab);
  // (Section headers are pressed by expandedTree; pressing them again would collapse what the rest needs.)
  const buttons = walkOptions(tree).filter(
    (n) => n.type === "execute" && n.canRun && !n.hidden && !n.disabled && !/^WeakAurasExpand/.test(n.control ?? ""),
  );
  for (const node of buttons) {
    const where = `${label}${tab} ${node.path.join("/")} ("${node.name ?? node.image ?? ""}")`;
    try {
      const edit = await core.setOption(base, { tab, path: node.path });
      out.edited++;
      if (edit.warning) out.problems.push(`${where}: addon error ${edit.warning}`);
      if (edit.changed) {
        const after = await core.options({ aura: edit.aura as AuraDocument, children: edit.children ?? base.children }, { tab });
        if (after.error) out.problems.push(`${where}: tab no longer builds: ${after.error}`);
      }
    } catch (e) {
      out.problems.push(`${where}: ${(e as Error).message}`);
    }
  }
}

function report(name: string, out: SweepResult) {
  if (out.problems.length) console.log(`SWEEP ${name}\n` + out.problems.join("\n"));
  if (out.mismatches.length) console.log(`SHOWN ${name}\n` + out.mismatches.join("\n"));
  expect(out.problems).toEqual([]);
  expect(out.mismatches).toEqual([]);
}

const fresh = (): SweepResult => ({ problems: [], mismatches: [], edited: 0 });

describe.each(TYPES)("%s", (regionType) => {
  test("every tab builds, and every editable option takes a value and shows it again", { timeout: 600_000 }, async () => {
    const base = await newState(regionType);
    const { tabs } = await core.options(base);
    const out = fresh();
    for (const { key: tab } of tabs) await sweepTab(base, tab, out);
    expect(out.edited).toBeGreaterThan(5);
    report(regionType, out);
  });

  test("every button (add, delete, move, duplicate, …) runs", { timeout: 600_000 }, async () => {
    const base = await newState(regionType);
    const { tabs } = await core.options(base);
    const out = fresh();
    for (const { key: tab } of tabs) await pressAll(base, tab, out);
    report(regionType, out);
  });
});

describe("deeper", () => {
  test("every trigger type (and event) of the Trigger tab builds and takes values", { timeout: 1_200_000 }, async () => {
    const base = await newState("icon");
    const out = fresh();
    const trigger = (await core.options(base, { tab: "trigger" })).tree!;
    const typeSelect = walkOptions(trigger).find((n) => n.type === "select" && /^trigger\.1\.[^.]+\.type$/.test(n.key))!;
    expect(typeSelect).toBeDefined();
    for (const [type] of typeSelect.values ?? []) {
      const typed = { aura: (await core.setOption(base, { tab: "trigger", path: typeSelect.path }, type)).aura, children: [] };
      const built = await core.options(typed, { tab: "trigger" });
      if (!built.tree) {
        out.problems.push(`[${String(type)}] trigger tab: ${built.error}`);
        continue;
      }
      const tree = built.tree;
      // A trigger type with sub types (Event: the event list) is swept per sub type.
      const sub = walkOptions(tree).find((n) => n.type === "select" && /^trigger\.1\.[^.]+\.event$/.test(n.key) && !n.hidden);
      const states = [typed];
      for (const [event] of sub?.values ?? []) {
        if (event === sub!.value) continue;
        states.push({ aura: (await core.setOption(typed, { tab: "trigger", path: sub!.path }, event)).aura, children: [] });
      }
      for (const state of states) await sweepTab(state, "trigger", out, `[${String(type)}] `);
    }
    expect(out.edited).toBeGreaterThan(200);
    report("trigger types", out);
  });

  test("after each Add button, the new part's options take values too", { timeout: 1_200_000 }, async () => {
    const base = await newState("icon");
    const out = fresh();
    for (const tab of ["region", "conditions", "action", "animation", "authorOptions", "trigger"]) {
      const tree = await expandedTree(base, tab);
      const adds = walkOptions(tree).filter((n) => n.type === "execute" && n.canRun && !n.hidden && !n.disabled && (/^Add\b/.test(n.name ?? "") || /(^|\\)add$/i.test(n.image ?? "")));
      for (const add of adds) {
        const edit = await core.setOption(base, { tab, path: add.path });
        if (!edit.changed) continue;
        const state = { aura: edit.aura, children: [] };
        await sweepTab(state, tab, out, `[${add.name ?? add.key}] `);
        await pressAll(state, tab, out, `[${add.name ?? add.key}] `);
      }
    }
    report("after adding", out);
  });
});
