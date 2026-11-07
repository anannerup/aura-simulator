/**
 * The option ↔ table reference at seam A: every option of every tab of every display type has an entry, and an
 * entry's table paths are exactly what its set() changes when the edit is made again here (on every display type,
 * trigger type, event and added part it lists), diffed independently of the generator.
 */
import { beforeAll, describe, expect, test } from "vitest";
import {
  isLuaTable,
  loadAddon,
  type AuraCore,
  type AuraState,
  type LuaValue,
  type OptionNode,
  type OptionReference,
  type OptionReferenceEntry,
  type OptionScope,
} from "@/core";
import { cachedAddonFetcher } from "../../tests/support/addon-source";
import { walkOptions } from "../../tests/support/options-sweep";

const REF = "v1.15.0";
let core: AuraCore;
let reference: OptionReference;
let generationMs: number;

beforeAll(async () => {
  core = await loadAddon(REF, { fetchSource: cachedAddonFetcher(REF) });
  await core.loadFullAddon();
  const t0 = performance.now();
  reference = await core.optionReference();
  generationMs = performance.now() - t0;
}, 300_000);

/** Leaf paths that differ between two tables, number keys as plain numbers (the reference's path form). */
function diff(a: LuaValue | undefined, b: LuaValue | undefined, prefix: string[] = []): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  // A table added where there was none is entered (its keys are written), like one added to an empty table.
  if (a === undefined && isLuaTable(b) && Object.keys(b).length > 0) a = {};
  if (!isLuaTable(a) || !isLuaTable(b)) return [prefix.join(".")];
  const entries = (t: LuaValue) =>
    new Map<string, LuaValue>(Array.isArray(t) ? t.map((v, i) => [String(i + 1), v]) : Object.entries(t).map(([k, v]) => [k.replace(/^\[(\d+)\]$/, "$1"), v]));
  const ea = entries(a);
  const eb = entries(b);
  const scalars = [...ea.values(), ...eb.values()].every((v) => !isLuaTable(v));
  const empty = (t: LuaValue) => Object.keys(t as object).length === 0;
  if (prefix.length > 0) {
    if (Array.isArray(a) !== Array.isArray(b) && !empty(a) && !empty(b)) return [prefix.join(".")];
    if (scalars && (Array.isArray(a) || Array.isArray(b))) return [prefix.join(".")];
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return [prefix.join(".")];
  }
  const out: string[] = [];
  for (const k of new Set([...ea.keys(), ...eb.keys()])) {
    if (!eb.has(k) || (!ea.has(k) && /^\d+$/.test(k))) out.push([...prefix, k].join("."));
    else out.push(...diff(ea.get(k), eb.get(k), [...prefix, k]));
  }
  return out;
}

const tree = async (state: AuraState, tab: string) => {
  const r = await core.options(state, { tab });
  if (!r.tree) throw new Error(`${tab}: ${r.error}`);
  return r.tree;
};

const isExpander = (n: OptionNode) => /^WeakAurasExpand/.test(n.control ?? "");
const referenced = (n: OptionNode) =>
  n.path.length > 0 &&
  !n.errors?.get &&
  ((n.canSet === true && ["toggle", "input", "range", "select", "multiselect", "color"].includes(n.type)) ||
    (n.type === "execute" && n.canRun === true && !isExpander(n)));

/** A display type's new aura as the reference starts from it: the addon's New Aura, defaults filled, groups with an icon child. */
async function newState(regionType: string): Promise<AuraState> {
  const aura = await core.newAura(regionType);
  if (regionType !== "group" && regionType !== "dynamicgroup") return core.fillDefaults({ aura: { ...aura, id: "Reference" }, children: [] });
  const child = { ...(await core.newAura("icon")), id: "Reference child", parent: "Reference" };
  return core.fillDefaults({ aura: { ...aura, id: "Reference", controlledChildren: ["Reference child"] }, children: [child] });
}

/** Sets a few shown options to the value they show, so what set() writes on its own is in the aura before the probe. */
async function settle(state: AuraState, tab: string): Promise<AuraState> {
  const nodes = walkOptions(await tree(state, tab)).filter((n) => n.canSet && !n.hidden && !n.disabled);
  const selects = nodes.filter((n) => n.type === "select" && (n.values ?? []).some(([k]) => k === n.value));
  const toggles = nodes.filter((n) => n.type === "toggle" && typeof n.value === "boolean");
  for (const n of [...selects, ...toggles].slice(0, 4)) {
    const e = await core.setOption(state, { tab, path: n.path }, n.value).catch(() => undefined);
    if (e?.changed) state = { aura: e.aura, children: e.children ?? state.children };
  }
  return state;
}

const bases = new Map<string, Promise<AuraState>>();
/** The settled aura a scope's probes start from (undefined for scopes this test doesn't rebuild: choices made first). */
function baseFor(scope: OptionScope, tab: string): Promise<AuraState> | undefined {
  if (scope.after) return undefined;
  const key = JSON.stringify([scope, tab]);
  let base = bases.get(key);
  if (!base) {
    base = (async () => {
      const fresh = await newState(scope.regionType);
      if (scope.triggerType !== undefined) {
        const typeSelect = walkOptions(await tree(fresh, "trigger")).find((n) => n.type === "select" && /^trigger\.1\.[^.]+\.type$/.test(n.key))!;
        let state = await settle({ aura: (await core.setOption(fresh, { tab: "trigger", path: typeSelect.path }, scope.triggerType)).aura, children: [] }, "trigger");
        if (scope.event !== undefined) {
          const sub = walkOptions(await tree(state, "trigger")).find((n) => n.type === "select" && /^trigger\.1\.[^.]+\.event$/.test(n.key) && !n.hidden)!;
          if (String(sub.value) !== scope.event) {
            state = await settle({ aura: (await core.setOption(state, { tab: "trigger", path: sub.path }, scope.event)).aura, children: [] }, "trigger");
          }
        }
        return state;
      }
      const { tabs } = await core.options(fresh);
      let all = fresh;
      for (const t of tabs) all = await settle(all, t.key);
      const settled = await settle(all, tab);
      if (!scope.added) return settled;
      const e = await core.setOption(settled, { tab, path: scope.added.option });
      return settle({ aura: e.aura, children: e.children ?? settled.children }, tab);
    })();
    bases.set(key, base);
  }
  return base;
}

describe(`option reference of ${REF}`, () => {
  test("is plain JSON, generated in acceptable time", () => {
    console.log(`option reference: ${reference.entries.length} entries, ${JSON.stringify(reference).length} bytes, ${Math.round(generationMs)} ms`);
    expect(JSON.parse(JSON.stringify(reference))).toEqual(reference);
    expect(generationMs).toBeLessThan(180_000);
    expect(reference.regionTypes).toEqual(expect.arrayContaining(["icon", "aurabar", "text", "group", "dynamicgroup"]));
  });

  test("every option of every tab of every display type has an entry", { timeout: 300_000 }, async () => {
    const missing: string[] = [];
    let options = 0;
    for (const regionType of reference.regionTypes) {
      const base = await newState(regionType);
      for (const { key: tab } of (await core.options(base)).tabs) {
        for (const node of walkOptions(await tree(base, tab)).filter(referenced)) {
          options++;
          const found = reference.entries.some(
            (e) =>
              e.tab === tab &&
              JSON.stringify(e.option) === JSON.stringify(node.path) &&
              e.scopes.some((s) => s.regionType === regionType && !s.added && !s.after && !s.triggerType),
          );
          if (!found) missing.push(`${regionType} ${tab} ${node.path.join("/")}`);
        }
      }
    }
    expect(options).toBeGreaterThan(1000);
    expect(missing).toEqual([]);
  });

  test("every trigger type and event has entries", () => {
    expect(reference.triggerTypes.length).toBeGreaterThan(3);
    for (const { type, events } of reference.triggerTypes) {
      for (const event of events?.map(([e]) => String(e)) ?? [undefined]) {
        const has = reference.entries.some((e) => e.tab === "trigger" && e.scopes.some((s) => s.triggerType === type && s.event === event));
        expect(has, `${type} ${event ?? ""}`).toBe(true);
      }
    }
  });

  test("every entry's paths are exactly what its set() changes", { timeout: 1_200_000 }, async () => {
    const wrong: string[] = [];
    let replayed = 0;
    const replay = async (entry: OptionReferenceEntry, scope: OptionScope) => {
      const base = await baseFor(scope, entry.tab);
      if (!base) return;
      const value = entry.type === "execute" ? undefined : entry.probe?.value;
      if (entry.type !== "execute" && value === undefined) return;
      const edit = await core.setOption(base, { tab: entry.tab, path: entry.option }, value).catch((e: Error) => e);
      const where = `${JSON.stringify(scope)} ${entry.tab} ${entry.option.join("/")}`;
      if (edit instanceof Error) {
        wrong.push(`${where}: ${edit.message}`);
        return;
      }
      replayed++;
      let writes = diff(base.aura, edit.aura).sort();
      if (entry.type === "multiselect") {
        const key = String((value as [unknown])[0]);
        writes = writes.map((p) => p.split(".").map((s) => (s === key ? "*" : s)).join("."));
      }
      if (JSON.stringify(writes) !== JSON.stringify(entry.writes)) wrong.push(`${where}: wrote ${JSON.stringify(writes)}, entry says ${JSON.stringify(entry.writes)}`);
      if (edit.children) {
        const child = [...new Set(edit.children.flatMap((c, i) => diff(base.children[i], c)))].sort();
        if (JSON.stringify(child) !== JSON.stringify(entry.childWrites ?? [])) wrong.push(`${where}: children ${JSON.stringify(child)} vs ${JSON.stringify(entry.childWrites)}`);
      }
    };
    // Buttons last: Move Up, Delete, … move the window's opened/closed sections along, which the reference resets
    // after each and this test can't.
    const fieldsFirst = [...reference.entries.filter((e) => e.type !== "execute"), ...reference.entries.filter((e) => e.type === "execute")];
    for (const entry of fieldsFirst) {
      if (entry.error) continue;
      for (const scope of entry.scopes) await replay(entry, scope);
    }
    console.log(`replayed ${replayed} probes`);
    expect(replayed).toBeGreaterThan(3000);
    expect(wrong).toEqual([]);
  });

  test("the reverse index finds the options writing a path", () => {
    const at = (path: string) => (reference.byPath[path] ?? []).map((i) => reference.entries[i]);
    expect(at("triggers.#.trigger.type").some((e) => e.tab === "trigger" && e.type === "select")).toBe(true);
    expect(at("alpha").some((e) => e.tab === "region")).toBe(true);
    const ifs = at("conditions.#.check.variable");
    expect(ifs.some((e) => e.choices?.some((c) => c.wrote["conditions.1.check.variable"] === "incombat"))).toBe(true);
    expect(at("load.class.multi.*").some((e) => e.tab === "load" && e.type === "multiselect")).toBe(true);
    for (const [path, indices] of Object.entries(reference.byPath)) {
      for (const i of indices) expect(reference.entries[i].writes.map((p) => p.replace(/(^|\.)\d+(?=\.|$)/g, "$1#")), path).toContain(path);
    }
  });
});
