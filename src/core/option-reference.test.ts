/**
 * The option ↔ table reference at seam A, per game (Forever: Musca Auras; TBC: WeakAuras2 from its release zip,
 * skipped when the zip can't be downloaded): every option of every tab of every display type has an entry, an
 * entry's table paths are exactly what its set() changes when the edit is made again here (on every display type,
 * trigger type, event and added part it lists), diffed independently of the generator, and each path names the same
 * key in the aura's wago JSON. Every trigger type's (and event's) condition checks are there, and every check,
 * property and their op/value fields write exactly what choosing them again here writes.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  isLuaTable,
  loadAddon,
  OPTION_REFERENCE_FORMAT,
  plainText,
  toWagoJson,
  type AddonGameId,
  type AuraCore,
  type AuraState,
  type ConditionField,
  type LuaValue,
  type OptionNode,
  type OptionReference,
  type OptionReferenceEntry,
  type OptionScope,
} from "@/core";
import { cachedAddonFetcher } from "../../tests/support/addon-source";
import { generatedCache } from "../../tests/support/generated-cache";
import { walkOptions } from "../../tests/support/options-sweep";
import { currentShard, isFirstShard, runsGame, shardUnits } from "../../tests/support/shards";
import { TBC_TEST_VERSION, weakAuras2Available, weakAuras2Fetcher } from "../../tests/support/weakauras2";

const FOREVER_REF = "v1.15.0";
interface ReferenceGame {
  game: AddonGameId;
  ref: string;
  load: {
    /** Whether the game's addon can be loaded here (TBC: false offline). */
    available(): Promise<boolean>;
    core(): Promise<AuraCore>;
  };
}
const GAMES: ReferenceGame[] = [
  {
    game: "forever",
    ref: FOREVER_REF,
    load: { available: async () => true, core: () => loadAddon(FOREVER_REF, { fetchSource: cachedAddonFetcher(FOREVER_REF) }) },
  },
  {
    game: "tbc",
    ref: TBC_TEST_VERSION,
    load: {
      available: () => weakAuras2Available(),
      core: () => loadAddon(TBC_TEST_VERSION, { fetchSource: weakAuras2Fetcher(), game: "tbc" }),
    },
  },
];

/** The game whose tests run now (games run one after the other); undefined core: skipped (TBC offline). */
let core: AuraCore | undefined;
/**
 * The game's reference: generated when this addon version's isn't cached for the generator's current code
 * (`generatedCache`: any change to the code generating it is a new key), else the cached one.
 */
let reference: OptionReference;
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

/**
 * The suite's units, each run whole by one shard: a display type (its options, their probes, its condition
 * properties) or a trigger type (its probes on every event, its condition checks). A unit's bases are made in its
 * shard only.
 */
const displayUnit = (regionType: string) => `display:${regionType}`;
const triggerUnit = (triggerType: string) => `trigger:${triggerType}`;
const unitOf = (scope: OptionScope) => (scope.triggerType !== undefined ? triggerUnit(scope.triggerType) : displayUnit(scope.regionType));

/** Each unit's weight: about how many edits its checks make (shards are dealt out by it). */
function unitWeights(ref: OptionReference): Map<string, number> {
  const w = new Map<string, number>([...ref.regionTypes.map(displayUnit), ...ref.triggerTypes.map((t) => triggerUnit(t.type))].map((u) => [u, 0]));
  const add = (unit: string, n: number) => w.set(unit, (w.get(unit) ?? 0) + n);
  for (const e of ref.entries) {
    if (e.error) continue;
    // A display type's own options are checked twice: for an entry (with the window built) and replayed.
    for (const s of e.scopes) add(unitOf(s), !s.triggerType && !s.added && !s.after ? 2 : 1);
  }
  for (const set of ref.conditions.checks) add(triggerUnit(set.triggerType), set.checks.reduce((n, c) => n + 1 + c.fields.length, 0));
  for (const set of ref.conditions.properties) add(displayUnit(set.regionType), set.properties.reduce((n, p) => n + 1 + p.fields.length, 0));
  return w;
}

const shard = currentShard();

describe.each(GAMES.filter((g) => runsGame(shard, g.game)))("option reference of $game $ref", ({ game, ref, load }) => {
  /** This shard's units. */
  let units: Set<string>;
  let fresh: boolean;
  beforeAll(async () => {
    bases.clear();
    shownCache.clear();
    if (!(await load.available())) return;
    // Generated (when not cached for this addon version and generator code) on a core of its own, so the core the
    // checks use starts the same either way.
    const cached = await generatedCache(`option-reference-${game}-${ref}`, "src/core/addon-vm/vm.ts", async () => {
      const generator = await load.core();
      try {
        return await generator.optionReference();
      } finally {
        generator.dispose();
      }
    });
    reference = cached.value;
    fresh = cached.fresh;
    core = await load.core();
    await core.loadFullAddon();
    const weights = unitWeights(reference);
    units = new Set(shardUnits([...weights.keys()], (u) => weights.get(u)!, shard));
  }, 600_000);
  afterAll(() => {
    core?.dispose();
    core = undefined;
  });
  /** Skips the test when the game's addon isn't available here (TBC offline). */
  const ready = (ctx: { skip: () => void }) => {
    if (!core) ctx.skip();
  };
  /** Checks of the whole reference (not split into units) run in the first shard. */
  const whole = (ctx: { skip: () => void }) => {
    ready(ctx);
    if (!isFirstShard(shard)) ctx.skip();
  };

  test("is plain JSON, generated in acceptable time, by this addon version and generator", (ctx) => {
    whole(ctx);
    console.log(
      `option reference (${game}): ${reference.entries.length} entries, ${JSON.stringify(reference).length} bytes, ${reference.generatedMs} ms (${fresh ? "generated now" : "cached"})`,
    );
    expect(JSON.parse(JSON.stringify(reference))).toEqual(reference);
    expect(reference).toMatchObject({ format: OPTION_REFERENCE_FORMAT, ref });
    // About a minute and a half per game on an idle machine (the condition checks and properties take a third of it).
    // Timed when generated here: a cached one may come from the e2e server, which generates in the background.
    if (fresh) expect(reference.generatedMs).toBeLessThan(300_000);
    expect(reference.regionTypes).toEqual(expect.arrayContaining(["icon", "aurabar", "text", "group", "dynamicgroup"]));
    // Big enough that the replays below mean something (each probe and check is replayed in some shard).
    const probes = reference.entries.filter((e) => !e.error).reduce((n, e) => n + e.scopes.filter((s) => !s.after).length, 0);
    expect(probes).toBeGreaterThan(3000);
    expect(reference.conditions.checks.reduce((n, s) => n + s.checks.length, 0)).toBeGreaterThan(300);
    expect(reference.conditions.properties.reduce((n, s) => n + s.properties.length, 0)).toBeGreaterThan(300);
  });

  test("every option of every tab of every display type has an entry", { timeout: 300_000 }, async (ctx) => {
    ready(ctx);
    const missing: string[] = [];
    let options = 0;
    const regionTypes = reference.regionTypes.filter((t) => units.has(displayUnit(t)));
    for (const regionType of regionTypes) {
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
    // Every display type has many options (over a thousand in all).
    expect(options).toBeGreaterThanOrEqual(50 * regionTypes.length);
    expect(missing).toEqual([]);
  });

  test("every trigger type and event has entries", (ctx) => {
    whole(ctx);
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
    let mine = 0;
    for (const entry of fieldsFirst) {
      if (entry.error) continue;
      for (const scope of entry.scopes.filter((s) => units.has(unitOf(s)))) {
        mine++;
        await replay(entry, scope);
      }
    }
    console.log(`replayed ${replayed} of this shard's ${mine} probes`);
    if (mine > 0) expect(replayed).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });

  test("the reverse index finds the options writing a path", (ctx) => {
    whole(ctx);
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

  test("the condition checks agents found missing are there", (ctx) => {
    whole(ctx);
    const { conditions } = reference;
    const variables = (type: string, event?: string) =>
      conditions.checks.find((s) => s.triggerType === type && s.event === event)?.checks.map((c) => c.variable) ?? [];
    // Aura(s) Found (with Show On "Always"), Item Count's stacks, item cooldown and weapon enchant checks.
    expect(variables("aura2")).toContain("buffed");
    expect(conditions.checks.find((s) => s.triggerType === "aura2")!.checks.find((c) => c.variable === "buffed")!.requires!.wrote).toEqual({
      "triggers.1.trigger.matchesShowOn": "showAlways",
    });
    expect(variables("item", "Item Count")).toContain("stacks");
    expect(variables("item", "Cooldown Progress (Item)")).toContain("onCooldown");
    expect(variables("item", "Weapon Enchant")).toContain("enchanted");
    expect(conditions.global.map((c) => c.variable)).toEqual(expect.arrayContaining(["AND", "OR", "incombat", "alwaystrue"]));
  });

  test("every trigger type's condition checks are there, with the keys replaying each writes", { timeout: 1_200_000 }, async (ctx) => {
    ready(ctx);
    const { conditions } = reference;
    const wrong: string[] = [];
    let replayed = 0;
    const sets = reference.triggerTypes
      .filter(({ type }) => units.has(triggerUnit(type)))
      .flatMap(({ type, events }) => (events?.map(([e]) => String(e)) ?? [undefined]).map((event) => ({ type, event })));
    for (const { type, event } of sets) {
      const where = `${type} ${event ?? ""}`;
      const set = conditions.checks.find((s) => s.triggerType === type && s.event === event);
      if (!set) {
        wrong.push(`${where}: no checks`);
        continue;
      }
      const typed = (await baseFor({ regionType: conditions.regionType, triggerType: type, ...(event !== undefined && { event }) }, "trigger"))!;
      const base = await withCondition(typed);
      const ifNode = await selectWithLabels(base, set.checks.filter((c) => !c.requires).map((c) => c.label));
      if (!ifNode) {
        wrong.push(`${where}: no If select with the checks' labels`);
        continue;
      }
      // Every If choice of trigger 1 is a check of the set, and writes what the check says.
      const seen = new Set<string>();
      for (const [value, label] of ifNode.values ?? []) {
        const edit = await core!.setOption(base, { tab: "conditions", path: ifNode.path }, value);
        const writes = diff(base.aura, edit.state.aura).sort();
        if (!writes.includes("conditions.1.check.trigger") || (edit.state.aura.conditions as { check: { trigger: unknown } }[])[0].check.trigger !== 1) continue;
        replayed++;
        const check = set.checks.find((c) => c.label === plainText(label).trim() && !c.requires);
        if (!check) {
          wrong.push(`${where}: If "${plainText(label).trim()}" is missing`);
          continue;
        }
        seen.add(check.label);
        if (JSON.stringify(writes) !== JSON.stringify(check.writes)) wrong.push(`${where} ${check.label}: wrote ${JSON.stringify(writes)}, check says ${JSON.stringify(check.writes)}`);
        wrong.push(...(await replayFields(edit.state, check.fields, `${where} ${check.label}`)));
      }
      for (const c of set.checks.filter((x) => !x.requires && !seen.has(x.label))) wrong.push(`${where}: ${c.label} isn't an If choice`);
      // A check that needs a Trigger setting: offered once it is set, and writes what the check says.
      for (const c of set.checks.filter((x) => x.requires)) {
        const set1 = await core!.setOption(base, { tab: "trigger", path: c.requires!.option }, c.requires!.value);
        const withSetting = set1.state;
        const node = (await selectWithLabels(withSetting, [c.label]))!;
        const choice = node?.values?.find(([, l]) => plainText(l).trim() === c.label);
        if (!choice) {
          wrong.push(`${where}: ${c.label} isn't offered after ${c.requires!.name}`);
          continue;
        }
        replayed++;
        const edit = await core!.setOption(withSetting, { tab: "conditions", path: node.path }, choice[0]);
        const writes = diff(withSetting.aura, edit.state.aura).sort();
        if (JSON.stringify(writes) !== JSON.stringify(c.writes)) wrong.push(`${where} ${c.label}: wrote ${JSON.stringify(writes)}, check says ${JSON.stringify(c.writes)}`);
        wrong.push(...(await replayFields(edit.state, c.fields, `${where} ${c.label}`)));
      }
    }
    console.log(`replayed ${replayed} condition checks`);
    if (sets.length > 0) expect(replayed).toBeGreaterThan(0);
    expect(wrong).toEqual([]);
  });

  test("every display type's condition properties write what replaying them writes", { timeout: 1_200_000 }, async (ctx) => {
    ready(ctx);
    const wrong: string[] = [];
    let replayed = 0;
    for (const regionType of reference.regionTypes.filter((t) => !t.endsWith("group") && units.has(displayUnit(t)))) {
      if (!reference.conditions.properties.some((p) => p.regionType === regionType)) wrong.push(`${regionType}: no properties`);
    }
    for (const set of reference.conditions.properties.filter((s) => units.has(displayUnit(s.regionType)))) {
      const where = `${set.regionType} (${set.added.name})`;
      // The display's new aura, settled, with one sub element of each kind the Display tab's Add buttons add.
      const fresh = await newState(set.regionType);
      let state = fresh;
      for (const { key } of (await core!.options(fresh)).tabs) state = await settle(state, key);
      const adds = walkOptions(await tree(state, "region")).filter((n) => n.type === "execute" && n.canRun && !n.hidden && !n.disabled && /^Add\b/.test(n.name ?? ""));
      for (const add of adds) {
        const e = await core!.setOption(state, { tab: "region", path: add.path });
        const count = (a: AuraState["aura"]) => (Array.isArray(a.subRegions) ? a.subRegions.length : 0);
        if (count(e.state.aura) > count(state.aura)) state = e.state;
      }
      const types = (Array.isArray(state.aura.subRegions) ? (state.aura.subRegions as { type: string }[]) : []).map((s) => s.type);
      expect(types, where).toEqual(set.subRegions.map((s) => s.type));
      const added = await core!.setOption(state, { tab: "conditions", path: set.added.option });
      const base = added.state;
      const thenNode = await selectWithLabels(base, set.properties.map((p) => p.label));
      if (!thenNode) {
        wrong.push(`${where}: no Then select with the properties' labels`);
        continue;
      }
      const labels = (thenNode.values ?? []).map(([, l]) => plainText(l).trim());
      for (const p of set.properties) {
        const choice = thenNode.values![labels.indexOf(p.label)];
        const edit = await core!.setOption(base, { tab: "conditions", path: thenNode.path }, choice[0]);
        replayed++;
        const writes = diff(base.aura, edit.state.aura).sort();
        if (JSON.stringify(writes) !== JSON.stringify(p.writes)) wrong.push(`${where} ${p.label}: wrote ${JSON.stringify(writes)}, property says ${JSON.stringify(p.writes)}`);
        wrong.push(...(await replayFields(edit.state, p.fields, `${where} ${p.label}`)));
      }
    }
    console.log(`replayed ${replayed} condition properties`);
    expect(wrong).toEqual([]);
  });
});

/** `state` with a condition from the Conditions tab's first Add button. */
async function withCondition(state: AuraState): Promise<AuraState> {
  const add = walkOptions(await tree(state, "conditions")).find((n) => n.type === "execute" && n.canRun && /^Add\b/.test(n.name ?? ""))!;
  const e = await core!.setOption(state, { tab: "conditions", path: add.path });
  return e.state;
}

/** The Conditions tab's select offering every one of `labels` (If: the checks; Then: the properties). */
async function selectWithLabels(state: AuraState, labels: string[]): Promise<OptionNode | undefined> {
  return walkOptions(await tree(state, "conditions")).find((n) => {
    if (n.type !== "select" || n.hidden) return false;
    const offered = new Set((n.values ?? []).map(([, l]) => plainText(l).trim()));
    return labels.every((l) => offered.has(l));
  });
}

/** Replays each field's probe on the chosen condition: what it wrote must be the field's `writes`. */
async function replayFields(chosen: AuraState, fields: ConditionField[], where: string): Promise<string[]> {
  const wrong: string[] = [];
  for (const f of fields) {
    if (f.error || f.probe === undefined) continue;
    const edit = await core!.setOption(chosen, { tab: "conditions", path: f.option }, f.probe.value).catch((e: Error) => e);
    if (edit instanceof Error) {
      wrong.push(`${where} ${f.option.join("/")}: ${edit.message}`);
      continue;
    }
    const writes = diff(chosen.aura, edit.state.aura).sort();
    if (JSON.stringify(writes) !== JSON.stringify(f.writes)) wrong.push(`${where} ${f.option.join("/")}: wrote ${JSON.stringify(writes)}, field says ${JSON.stringify(f.writes)}`);
  }
  return wrong;
}
