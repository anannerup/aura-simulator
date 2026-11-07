/**
 * The option ↔ table reference at seam A, per game (Forever: Musca Auras; TBC: WeakAuras2 from its release zip,
 * skipped when the zip can't be downloaded): every option of every tab of every display type has an entry, an
 * entry's table paths are exactly what its set() changes when the edit is made again here (on every display type,
 * trigger type, event and added part it lists), diffed independently of the generator, and each path names the same
 * key in the aura's wago JSON.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  isLuaTable,
  loadAddon,
  toWagoJson,
  type AddonGameId,
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
import { TBC_TEST_VERSION, weakAuras2Available, weakAuras2Fetcher } from "../../tests/support/weakauras2";

const FOREVER_REF = "v1.15.0";
const GAMES: { game: AddonGameId; ref: string; load(): Promise<AuraCore | undefined> }[] = [
  { game: "forever", ref: FOREVER_REF, load: async () => loadAddon(FOREVER_REF, { fetchSource: cachedAddonFetcher(FOREVER_REF) }) },
  {
    game: "tbc",
    ref: TBC_TEST_VERSION,
    load: async () =>
      (await weakAuras2Available()) ? loadAddon(TBC_TEST_VERSION, { fetchSource: weakAuras2Fetcher(), game: "tbc" }) : undefined,
  },
];

/** The game whose tests run now (games run one after the other); undefined core: skipped (TBC offline). */
let core: AuraCore | undefined;
let reference: OptionReference;
let generationMs: number;
const bases = new Map<string, Promise<AuraState>>();

/**
 * Follows a table path through JSON as the reference says to read it: a number is the n-th element of an array, any
 * other step an object key. Also says whether a table the reference lists in `lists` was an array.
 */
function follow(json: unknown, path: string, lists: Set<string>): { found: boolean; listsAgree: boolean } {
  let cur: unknown = json;
  let listsAgree = true;
  const segs = path.split(".");
  for (let i = 0; i < segs.length; i++) {
    if (lists.has(segs.slice(0, i).join(".").replace(/(^|\.)\d+(?=\.|$)/g, "$1#")) && !Array.isArray(cur)) listsAgree = false;
    if (Array.isArray(cur)) cur = cur[Number(segs[i]) - 1];
    else if (cur !== null && typeof cur === "object") cur = (cur as Record<string, unknown>)[segs[i]];
    else return { found: false, listsAgree };
  }
  return { found: cur !== undefined, listsAgree };
}

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
  const r = await core!.options(state, { tab });
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
  const aura = await core!.newAura(regionType);
  if (regionType !== "group" && regionType !== "dynamicgroup") return core!.fillDefaults({ aura: { ...aura, id: "Reference" }, children: [] });
  const child = { ...(await core!.newAura("icon")), id: "Reference child", parent: "Reference" };
  return core!.fillDefaults({ aura: { ...aura, id: "Reference", controlledChildren: ["Reference child"] }, children: [child] });
}

/** Which options every tab shows. */
const shownCache = new Map<string, string>();
async function shown(state: AuraState): Promise<string> {
  const cacheKey = JSON.stringify(state);
  const hit = shownCache.get(cacheKey);
  if (hit !== undefined) return hit;
  const tabs = (await core!.options(state)).tabs;
  const paths = [];
  for (const { key } of tabs) paths.push(walkOptions(await tree(state, key)).filter(referenced).map((n) => n.path));
  shownCache.set(cacheKey, JSON.stringify(paths));
  return JSON.stringify(paths);
}

/**
 * Sets a few shown options to the value they show, so what set() writes on its own is in the aura before the probe
 * (an edit that changes which options the window shows is not kept).
 */
async function settle(state: AuraState, tab: string): Promise<AuraState> {
  const nodes = walkOptions(await tree(state, tab)).filter((n) => n.canSet && !n.hidden && !n.disabled);
  const selects = nodes.filter((n) => n.type === "select" && (n.values ?? []).some(([k]) => k === n.value));
  const toggles = nodes.filter((n) => n.type === "toggle" && typeof n.value === "boolean");
  let options: string | undefined;
  let tried = 0;
  for (const n of [...selects, ...toggles]) {
    if (tried === 4) break;
    const e = await core!.setOption(state, { tab, path: n.path }, n.value).catch(() => undefined);
    const next = e?.state;
    // The option must still show the value it showed (a tristate toggle's false is "not set"; setting it is "Not"):
    // otherwise it is skipped and doesn't count.
    if (next && e!.changed) {
      const after = walkOptions(await tree(next, tab)).find((m) => JSON.stringify(m.path) === JSON.stringify(n.path));
      if (JSON.stringify(after?.value) !== JSON.stringify(n.value)) continue;
    }
    tried++;
    if (!next || !e!.changed) continue;
    options ??= await shown(state);
    if ((await shown(next)) === options) state = next;
  }
  return state;
}

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
        let state = await settle((await core!.setOption(fresh, { tab: "trigger", path: typeSelect.path }, scope.triggerType)).state, "trigger");
        if (scope.event !== undefined) {
          const sub = walkOptions(await tree(state, "trigger")).find((n) => n.type === "select" && /^trigger\.1\.[^.]+\.event$/.test(n.key) && !n.hidden)!;
          if (String(sub.value) !== scope.event) {
            state = await settle((await core!.setOption(state, { tab: "trigger", path: sub.path }, scope.event)).state, "trigger");
          }
        }
        return state;
      }
      const { tabs } = await core!.options(fresh);
      let all = fresh;
      for (const t of tabs) all = await settle(all, t.key);
      const settled = await settle(all, tab);
      if (!scope.added) return settled;
      const e = await core!.setOption(settled, { tab, path: scope.added.option });
      return settle(e.state, tab);
    })();
    bases.set(key, base);
  }
  return base;
}

describe.each(GAMES)("option reference of $game $ref", ({ game, load }) => {
  beforeAll(async () => {
    bases.clear();
    core = await load();
    if (!core) return;
    await core!.loadFullAddon();
    const t0 = performance.now();
    reference = await core!.optionReference();
    generationMs = performance.now() - t0;
  }, 600_000);
  afterAll(() => {
    core?.dispose();
    core = undefined;
  });
  /** Skips the test when the game's addon isn't available here (TBC offline). */
  const ready = (ctx: { skip: () => void }) => {
    if (!core) ctx.skip();
  };

  test("is plain JSON, generated in acceptable time", (ctx) => {
    ready(ctx);
    console.log(`option reference (${game}): ${reference.entries.length} entries, ${JSON.stringify(reference).length} bytes, ${Math.round(generationMs)} ms`);
    expect(JSON.parse(JSON.stringify(reference))).toEqual(reference);
    expect(generationMs).toBeLessThan(180_000);
    expect(reference.regionTypes).toEqual(expect.arrayContaining(["icon", "aurabar", "text", "group", "dynamicgroup"]));
  });

  test("every option of every tab of every display type has an entry", { timeout: 300_000 }, async (ctx) => {
    ready(ctx);
    const missing: string[] = [];
    let options = 0;
    for (const regionType of reference.regionTypes) {
      for (const { key: tab } of (await core!.options(await newState(regionType))).tabs) {
        // The window as it shows the display type's new aura, settled as the reference's probes start from it.
        const base = await baseFor({ regionType }, tab)!;
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

  test("every trigger type and event has entries", (ctx) => {
    ready(ctx);
    expect(reference.triggerTypes.length).toBeGreaterThan(3);
    for (const { type, events } of reference.triggerTypes) {
      for (const event of events?.map(([e]) => String(e)) ?? [undefined]) {
        const has = reference.entries.some((e) => e.tab === "trigger" && e.scopes.some((s) => s.triggerType === type && s.event === event));
        expect(has, `${type} ${event ?? ""}`).toBe(true);
      }
    }
  });

  test("every entry's paths are exactly what its set() changes, and name the same keys in wago JSON", { timeout: 1_200_000 }, async (ctx) => {
    ready(ctx);
    const lists = new Set(reference.lists);
    const wrong: string[] = [];
    let replayed = 0;
    const replay = async (entry: OptionReferenceEntry, scope: OptionScope) => {
      const base = await baseFor(scope, entry.tab);
      if (!base) return;
      const value = entry.type === "execute" ? undefined : entry.probe?.value;
      if (entry.type !== "execute" && value === undefined) return;
      const edit = await core!.setOption(base, { tab: entry.tab, path: entry.option }, value).catch((e: Error) => e);
      const where = `${JSON.stringify(scope)} ${entry.tab} ${entry.option.join("/")}`;
      if (edit instanceof Error) {
        wrong.push(`${where}: ${edit.message}`);
        return;
      }
      replayed++;
      let writes = diff(base.aura, edit.state.aura).sort();
      // Each key the edit set is found at that path in the aura's wago JSON, and every listed table is an array there.
      const wago = (JSON.parse(toWagoJson({ aura: edit.state.aura, children: [] })) as { d: unknown }).d;
      for (const p of writes) {
        const at = follow(wago, p, lists);
        const inDoc = follow(edit.state.aura, p.replace(/(^|\.)(\d+)(?=\.|$)/g, "$1[$2]"), new Set()).found;
        if (!at.listsAgree || (inDoc && !at.found)) wrong.push(`${where}: ${p} is not that key in wago JSON`);
      }
      if (entry.type === "multiselect") {
        const key = String((value as [unknown])[0]);
        writes = writes.map((p) => p.split(".").map((s) => (s === key ? "*" : s)).join("."));
      }
      if (JSON.stringify(writes) !== JSON.stringify(entry.writes)) wrong.push(`${where}: wrote ${JSON.stringify(writes)}, entry says ${JSON.stringify(entry.writes)}`);
      const child = [...new Set(edit.state.children.flatMap((c, i) => diff(base.children[i], c)))].sort();
      if (JSON.stringify(child) !== JSON.stringify(entry.childWrites ?? [])) wrong.push(`${where}: children ${JSON.stringify(child)} vs ${JSON.stringify(entry.childWrites)}`);
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

  test("the reverse index finds the options writing a path", (ctx) => {
    ready(ctx);
    const at = (path: string) => (reference.byPath[path] ?? []).map((i) => reference.entries[i]);
    expect(at("triggers.#.trigger.type").some((e) => e.tab === "trigger" && e.type === "select")).toBe(true);
    expect(at("alpha").some((e) => e.tab === "region")).toBe(true);
    const ifs = at("conditions.#.check.variable");
    expect(ifs.some((e) => e.choices?.some((c) => c.wrote["conditions.1.check.variable"] === "incombat"))).toBe(true);
    expect(reference.lists).toEqual(expect.arrayContaining(["subRegions", "conditions", "conditions.#.changes"]));
    expect(reference.lists).not.toContain("triggers");
    expect(at("load.class.multi.*").some((e) => e.tab === "load" && e.type === "multiselect")).toBe(true);
    // Probes start from the new aura as the window shows it: a Load option writes only its own load key (the base is
    // not left unloaded by a "Not" set while settling, which made e.g. Alive also write every text's formats).
    const alive = reference.entries.filter(
      (e) => e.tab === "load" && e.option.join(".") === "use_alive" && e.scopes.some((s) => !s.regionType.endsWith("group")),
    );
    expect(alive.length).toBeGreaterThan(0);
    for (const e of alive) expect(e.writes, JSON.stringify(e.scopes)).toEqual(["load.use_alive"]);
    const offLoad = reference.entries.filter((e) => e.tab === "load" && e.writes.some((p) => !p.startsWith("load.")));
    expect(offLoad.map((e) => `${e.option.join(".")}: ${e.writes.join(", ")}`)).toEqual([]);
    for (const [path, indices] of Object.entries(reference.byPath)) {
      for (const i of indices) expect(reference.entries[i].writes.map((p) => p.replace(/(^|\.)\d+(?=\.|$)/g, "$1#")), path).toContain(path);
    }
  });
});
