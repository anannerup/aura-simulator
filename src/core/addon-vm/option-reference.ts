/**
 * The option ↔ table reference: for an addon version, which aura table keys each option of the options window writes,
 * and which options write each key. Generated, never written by hand: every option is changed once through its own
 * set() (a button: its func()) on a fresh aura from the addon's own New Aura, and the aura before and after is
 * diffed. So it is right for whatever the loaded addon version's options do. Plain JSON (cacheable per version).
 *
 * ## Table paths
 *
 * A table path is a chain of wago JSON keys, read from the aura's table (wago JSON's `d`; for a group's children,
 * each `c[i]`):
 * - the keys are joined with `.`; a string key is written as is (`trigger`, `subRegions`, `text_text`), and keys
 *   never contain `.`;
 * - a number `n` is the Lua key n, counted from 1. wago JSON writes a table whose keys are all numbers as a JSON
 *   array, so there n is the n-th element (index n-1): `subRegions`, `conditions`, `changes`, a colour (`lists` names
 *   the tables that always are). A table that also has string keys is an object, and n is its key `"n"`: `triggers`
 *   (`{"1": {…}, "activeTriggerMode": -10}`; with only triggers in it, it is an array too). The aura document has the
 *   same arrays and writes the object key as `"[n]"`;
 * - `*` (multiselect options only) stands for one key of the option's `values`: the option writes
 *   `<path with that key>: true` per checked value (e.g. `load.class.multi.*` → `load.class.multi.MAGE`);
 * - a path stops where a value changed as a whole: a scalar, a list of scalars (a colour `[r, g, b, a]` with 0..1
 *   parts, a list of spell IDs), a list whose length changed (`subRegions` after Delete), a removed key, or a new
 *   list element (`triggers.2` after Add Trigger: the whole entry). A new table under a string key is entered: its
 *   keys are the paths (`load.class.multi.MAGE`), so a missing and an empty table read the same.
 *
 * Examples: `triggers.1.trigger.type`, `subRegions.2.text_text`, `conditions.1.changes.1.value`, `color`. A probe
 * always edits the first trigger, condition or sub element of its kind; the same option exists for every other one
 * with that number changed.
 *
 * How the probes are made: each display type's aura from New Aura, with defaults filled and "settled" (a few options
 * of every tab set to the value they show, so what set() writes on its own is already in it); every option of every
 * tab, hidden ones too, is set once from that aura (a select: the first other choice that writes something; buttons
 * with the window's opened/closed sections put back after); then every Add button's new part; then, for selects whose
 * choice writes a whole setting (a condition's If, a property), every choice and the options it reveals; and on an
 * icon, every trigger type and event.
 *
 * The reverse index is keyed by path patterns: every number segment replaced by `#` (`triggers.#.trigger.type`), so
 * any trigger's, condition's or sub element's key finds its options.
 */
import { isLuaTable, keyFromString, type AuraDocument, type AuraState, type LuaKey, type LuaValue } from "../lua-value";
import type { NewAuraPage } from "./new-aura";
import type { OptionAddress, OptionEdit, OptionNode, OptionsTree, OptionTab } from "./options";

/** A key of an aura's table, written as described in the module doc (e.g. `triggers.1.trigger.type`). */
export type TablePath = string;

/** Where an option was probed: the display type and what was chosen first to make the option appear. */
export interface OptionScope {
  regionType: string;
  /** Trigger 1's type and event (trigger types with sub types: the Event trigger's event list). */
  triggerType?: string;
  event?: string;
  /** The Add button pressed first (e.g. "Add Glow", "Add Condition"): the option belongs to the part it added. */
  added?: { option: string[]; name: string };
  /** A choice made first in a select whose choices write more than the choice's key (e.g. a condition's "If"). */
  after?: { option: string[]; name: string; choice: string };
}

/** One choice of a select whose choices write whole settings (e.g. a condition's If: each check). */
export interface OptionChoice {
  value: LuaKey;
  label: string;
  /** What choosing it writes (tables leave their value out). */
  wrote: Record<TablePath, unknown>;
}

export interface OptionReferenceEntry {
  /** The options window's tab key (region = Display, action = Actions, …). */
  tab: string;
  /** The option's key path inside the tab (OptionAddress.path). */
  option: string[];
  name?: string;
  desc?: string;
  /** AceConfig type: toggle, input, range, select, multiselect, color, execute. */
  type: string;
  /** The addon's widget (e.g. WeakAurasSpinBox, LSM30_Font, WeakAurasMultiLineEditBox). */
  control?: string;
  /** Allowed values of a select/multiselect: [key, label]. */
  values?: [LuaKey, string][];
  min?: number;
  max?: number;
  softMin?: number;
  softMax?: number;
  step?: number;
  bigStep?: number;
  isPercent?: boolean;
  hasAlpha?: boolean;
  multiline?: boolean;
  /** What the option shows on a new aura (get()): colours [r, g, b, a], multiselects the checked keys. */
  default?: unknown;
  /** Hidden on a new aura until another option is set (e.g. a field behind its "use" toggle or a closed section). */
  hidden?: boolean;
  /** Every table path the option's set() changed. Empty: the option only changes the editor or needs a dialog. */
  writes: TablePath[];
  /** A group's options that write its children: the paths changed in each child's table. */
  childWrites?: TablePath[];
  /** The probe: the value given and what was written (tables leave their value out). */
  probe?: { value: unknown; wrote: Record<TablePath, unknown> };
  /** Selects whose choices write more than their key: what each choice writes. */
  choices?: OptionChoice[];
  /** The button opens a dialog (icon, texture, code, confirm, …) instead of writing. */
  dialog?: string;
  /** The probe failed (the addon refused the value): why. */
  error?: string;
  /** Everywhere the option was probed with this same result. */
  scopes: OptionScope[];
}

/** The reference's shape and generator version: changes when either does (caches keyed by it regenerate). */
export const OPTION_REFERENCE_FORMAT = 2;

export interface OptionReference {
  /** OPTION_REFERENCE_FORMAT of the generator that made it. */
  format: number;
  /** The addon ref the reference was generated from. */
  ref: string;
  /** How long generation took (ms). */
  generatedMs: number;
  tabs: OptionTab[];
  regionTypes: string[];
  /** Trigger types (and their events) probed on the trigger tab. */
  triggerTypes: { type: string; label: string; events?: [LuaKey, string][] }[];
  entries: OptionReferenceEntry[];
  /** Reverse index: path pattern (number segments as `#`) → indices into `entries` writing it in the aura's table. */
  byPath: Record<string, number[]>;
  /** Same for a group's children's tables. */
  byChildPath: Record<string, number[]>;
  /**
   * Path patterns of the tables that were lists (only number keys: JSON arrays in wago JSON and the aura document)
   * in every probed aura that had them: `subRegions`, `conditions`, `conditions.#.changes`, `color`, … A table with
   * number and string keys is an object with `"n"` keys (`triggers`, usually). An empty table is `[]` in wago JSON.
   */
  lists: string[];
}

/** The AddonVM calls the generator uses (synchronous; it runs inside the VM's worker or inline). */
export interface ReferenceSource {
  ref: string;
  options(state: AuraState, request?: { tab?: string }): OptionsTree;
  setOption(state: AuraState, address: OptionAddress, value: unknown): OptionEdit;
  newAuraPage(): NewAuraPage;
  newAura(regionType: string): AuraDocument;
  fillDefaults(state: AuraState): AuraState;
  /**
   * Runs `fn` and puts the window's opened and closed sections back as they were. Buttons (Move Up, Delete, …) move
   * those states along, and a closed section can change what a group's options write.
   */
  keepSections<T>(fn: () => T): T;
}

const EDITABLE = new Set(["toggle", "input", "range", "select", "multiselect", "color"]);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Every node of an option tree, pre-order. */
function walk(node: OptionNode): OptionNode[] {
  return [node, ...(node.args ?? []).flatMap(walk)];
}

/** A value of the kind the option takes, different from its current one; undefined when there is none. */
function probeValue(node: OptionNode): unknown {
  switch (node.type) {
    case "toggle":
      return !(node.value !== undefined && node.value !== null && node.value !== false);
    case "range": {
      const min = finite(node.softMin) ? node.softMin : finite(node.min) ? node.min : 0;
      const max = finite(node.softMax) ? node.softMax : finite(node.max) ? node.max : 100;
      const step = finite(node.step) && node.step > 0 ? node.step : 0;
      let v = min + (max - min) * 0.37;
      if (step) v = min + Math.round((v - min) / step) * step;
      if (finite(node.max)) v = Math.min(node.max, v);
      if (finite(node.min)) v = Math.max(node.min, v);
      return v === node.value ? (finite(node.max) && v + (step || 1) <= node.max ? v + (step || 1) : undefined) : v;
    }
    case "select": {
      const other = (node.values ?? []).find(([k]) => k !== node.value);
      return other ? other[0] : undefined;
    }
    case "multiselect": {
      const values = node.values ?? [];
      if (values.length === 0) return undefined;
      const current = new Map((Array.isArray(node.value) ? (node.value as [unknown, boolean][]) : []).map(([k, v]) => [k, v]));
      const key = values[0][0];
      return [key, !current.get(key)];
    }
    case "color":
      return [0.2, 0.4, 0.6, 0.8];
    case "input": {
      if (node.control === "WeakAurasInputFocus") return "1459";
      const current = typeof node.value === "number" ? node.value : Number(node.value);
      if (node.value !== undefined && node.value !== "" && Number.isFinite(current)) return String(current + 1);
      return node.multiline ? "-- probe" : "Probe";
    }
  }
  return undefined;
}

const scalar = (v: unknown) => !isLuaTable(v);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The table paths that differ between two aura tables (documents). A path stops at a value that changed as a whole:
 * a scalar, a table of scalars (a colour, a list of IDs), a sequence whose length changed, or a removed key. A table
 * added where there was none (or an empty one) is entered: its keys are the paths (`subRegions.1`,
 * `load.class.multi.MAGE`), so a missing and an empty table read the same.
 */
export function changedPaths(before: LuaValue | undefined, after: LuaValue | undefined, prefix: TablePath[] = []): TablePath[] {
  if (sameJson(before, after)) return [];
  const here = () => [prefix.join(".")];
  if (before === undefined && isLuaTable(after) && !isEmpty(after)) before = {};
  if (!isLuaTable(before) || !isLuaTable(after)) return here();
  const seqA = Array.isArray(before);
  const seqB = Array.isArray(after);
  if (seqA !== seqB && !(isEmpty(before) || isEmpty(after))) return here();
  const a = entriesOf(before);
  const b = entriesOf(after);
  // A table of scalars (colour, ID list) and a sequence that changed length are one value.
  if (prefix.length > 0 && ([...a.values(), ...b.values()].every(scalar) && (seqA || seqB))) return here();
  if (prefix.length > 0 && seqA && seqB && a.size !== b.size) return here();
  const out: TablePath[] = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    // A removed key, and a new element of a list (a trigger, condition or sub element: whatever it holds), are one path.
    if (!b.has(key) || (!a.has(key) && /^\d+$/.test(key))) out.push([...prefix, key].join("."));
    else out.push(...changedPaths(a.get(key), b.get(key), [...prefix, key]));
  }
  return out;
}

const isEmpty = (t: LuaValue) => isLuaTable(t) && Object.keys(t).length === 0;

/** A table's entries keyed by their path segment (Lua number keys as plain numbers). */
function entriesOf(t: LuaValue): Map<string, LuaValue> {
  if (Array.isArray(t)) return new Map(t.map((v, i) => [String(i + 1), v]));
  return new Map(Object.entries(t as Record<string, LuaValue>).map(([k, v]) => [String(keyFromString(k)), v]));
}

/** The value at a table path (undefined when absent). */
function valueAt(t: LuaValue | undefined, path: TablePath): LuaValue | undefined {
  let cur: LuaValue | undefined = t;
  for (const seg of path.split(".")) {
    if (!isLuaTable(cur)) return undefined;
    cur = entriesOf(cur).get(seg);
  }
  return cur;
}

/** The reverse index's key for a path: number segments as `#`. */
export const pathPattern = (path: TablePath) => path.replace(/(^|\.)\d+(?=\.|$)/g, "$1#");

/** A written value for `wrote`: tables are left out (undefined) unless they are a few scalars (a colour). */
function shownValue(v: LuaValue | undefined): unknown {
  if (v === undefined) return null;
  if (!isLuaTable(v)) return v;
  const values = Object.values(v);
  return values.length <= 8 && values.every(scalar) ? v : undefined;
}

function wroteOf(after: AuraDocument, paths: TablePath[]): Record<TablePath, unknown> {
  const wrote: Record<TablePath, unknown> = {};
  for (const p of paths) {
    const v = shownValue(valueAt(after, p));
    if (v !== undefined) wrote[p] = v;
  }
  return wrote;
}

/**
 * A display type's fresh aura as the tab sweep makes it (groups get one icon child), with the addon's defaults
 * filled in: the table as the addon holds it, so a probe's diff is exactly what set() changed.
 */
function newReferenceState(src: Pick<ReferenceSource, "newAura" | "fillDefaults">, regionType: string): AuraState {
  const aura = src.newAura(regionType);
  if (regionType !== "group" && regionType !== "dynamicgroup") return src.fillDefaults({ aura: { ...aura, id: "Reference" }, children: [] });
  const child = { ...src.newAura("icon"), id: "Reference child", parent: "Reference" };
  return src.fillDefaults({ aura: { ...aura, id: "Reference", controlledChildren: ["Reference child"] }, children: [child] });
}

const isExpander = (n: OptionNode) => /^WeakAurasExpand/.test(n.control ?? "");
/** An option the reference covers: editable fields and buttons (not section expanders, which only change the editor). */
const isReferenced = (n: OptionNode) =>
  n.path.length > 0 && !n.errors?.get && ((n.canSet === true && EDITABLE.has(n.type)) || (n.type === "execute" && n.canRun === true && !isExpander(n)));
const isAdd = (n: OptionNode) => n.type === "execute" && n.canRun === true && !n.hidden && !n.disabled && (/^Add\b/.test(n.name ?? "") || /(^|\\)add$/i.test(n.image ?? ""));

function defaultOf(node: OptionNode): unknown {
  if (node.type === "multiselect" && Array.isArray(node.value)) return (node.value as [LuaKey, boolean][]).filter(([, v]) => v).map(([k]) => k);
  return node.value;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** How generation shares its thread. */
export interface OptionReferenceOptions {
  /**
   * Generate in the background: pause as long as it works (15 ms each), so a server answering other requests from
   * the same thread stays responsive (it takes twice as long). Otherwise it only yields a turn every 40 ms.
   */
  background?: boolean;
}

/** Generates the reference for the addon version `src` runs: thousands of probe edits, about a minute. */
export async function buildOptionReference(src: ReferenceSource, options: OptionReferenceOptions = {}): Promise<OptionReference> {
  const t0 = now();
  let lastBreath = t0;
  const [work, rest] = options.background ? [15, 15] : [40, 0];
  const breathe = async () => {
    if (now() - lastBreath < work) return;
    await pause(rest);
    lastBreath = now();
  };
  const entries: OptionReferenceEntry[] = [];
  const byContent = new Map<string, number>();

  // Tables seen as lists, and seen as objects with keys (not lists), by path pattern.
  const asList = new Set<string>();
  const asObject = new Set<string>();
  const collectArrays = (v: LuaValue, prefix: string[] = []) => {
    if (!isLuaTable(v)) return;
    if (prefix.length > 0 && !isEmpty(v)) (Array.isArray(v) ? asList : asObject).add(pathPattern(prefix.join(".")));
    for (const [k, x] of entriesOf(v)) collectArrays(x, [...prefix, k]);
  };

  const add = (entry: Omit<OptionReferenceEntry, "scopes">, scope: OptionScope) => {
    const key = JSON.stringify(entry);
    const i = byContent.get(key);
    if (i !== undefined) {
      entries[i].scopes.push(scope);
      return i;
    }
    byContent.set(key, entries.length);
    entries.push({ ...entry, scopes: [scope] });
    return entries.length - 1;
  };

  /** Applies one edit; undefined edit with an error when the addon refused it. */
  const edit = (state: AuraState, tab: string, node: OptionNode, value: unknown, keep = true) => {
    try {
      if (node.type === "execute" && keep) return { value, edit: src.keepSections(() => src.setOption(state, { tab, path: node.path }, value)) };
      return { value, edit: src.setOption(state, { tab, path: node.path }, value) };
    } catch (e) {
      // The addon refuses text in a number field (its validate()); a number goes in.
      if (node.type === "input" && e instanceof Error && e.name === "OptionEditError") {
        try {
          return { value: "5", edit: src.setOption(state, { tab, path: node.path }, "5") };
        } catch (e2) {
          return { value, error: (e2 as Error).message };
        }
      }
      return { value, error: (e as Error).message };
    }
  };

  const childDiff = (state: AuraState, e: OptionEdit) => {
    if (!e.children) return undefined;
    const paths = new Set<TablePath>();
    e.children.forEach((c, i) => changedPaths(state.children[i], c).forEach((p) => paths.add(p)));
    return paths.size ? [...paths].sort() : undefined;
  };

  /** Choices already followed (same display type, tab, option and written values). */
  const followed = new Set<string>();

  /**
   * Probes one option on `state` and records it under `scope` (merged with an identical entry from elsewhere).
   * Every place is probed on its own: the same option can write more on another aura (a text aura's trigger type also
   * writes its automaticWidth; Add Trigger also normalizes trigger 1 of some trigger types).
   */
  const probe = (state: AuraState, tab: string, node: OptionNode, scope: OptionScope): OptionReferenceEntry => {
    const entry: Omit<OptionReferenceEntry, "scopes"> = { tab, option: node.path, type: node.type, writes: [] };
    for (const f of ["name", "desc", "control", "min", "max", "softMin", "softMax", "step", "bigStep", "isPercent", "hasAlpha"] as const) {
      if (node[f] !== undefined && node[f] !== "") (entry as Record<string, unknown>)[f] = node[f];
    }
    if (node.multiline) entry.multiline = true;
    if (node.values) entry.values = node.values;
    if (node.type !== "execute" && node.value !== undefined) entry.default = defaultOf(node);
    if (node.hidden) entry.hidden = true;
    const recorded = () => entries[add(entry, scope)];

    let r: ReturnType<typeof edit> | undefined;
    if (node.type === "execute") r = edit(state, tab, node, undefined);
    else if (node.type === "select") {
      // The first other choice; a choice that writes nothing (a heading of the list) gives way to the next ones.
      const others = (node.values ?? []).filter(([k]) => k !== node.value).slice(0, 5);
      for (const [k] of others) {
        r = edit(state, tab, node, k);
        if (!r.edit || r.edit.changed) break;
      }
    } else {
      const value = probeValue(node);
      if (value !== undefined) r = edit(state, tab, node, value);
    }
    if (!r) return recorded();
    if (!r.edit) {
      entry.error = r.error;
      return recorded();
    }
    const e = r.edit;
    collectArrays(e.aura);
    const value = r.value;
    const changed = changedPaths(state.aura, e.aura).sort();
    entry.writes = changed;
    if (node.type === "multiselect") {
      const key = String((value as [LuaKey])[0]);
      entry.writes = changed.map((p) => p.split(".").map((seg) => (seg === key ? "*" : seg)).join("."));
    }
    const childWrites = childDiff(state, e);
    if (childWrites) entry.childWrites = childWrites;
    if (node.type !== "execute") entry.probe = { value, wrote: wroteOf(e.aura, changed) };
    if (e.dialog) entry.dialog = e.dialog.kind;
    // A select whose choice writes something other than its key (e.g. an index into the condition checks): each
    // choice's writes.
    if (node.type === "select" && changed.length > 0 && node.values && node.values.length <= 300) {
      const plain = changed.some((p) => {
        const v = valueAt(e.aura, p);
        return sameJson(v, value) || sameJson(v, [value]);
      });
      if (!plain) {
        entry.choices = [];
        for (const [v, label] of node.values) {
          const c = edit(state, tab, node, v);
          if (!c.edit) continue;
          entry.choices.push({ value: v, label, wrote: wroteOf(c.edit.aura, changedPaths(state.aura, c.edit.aura)) });
        }
      }
    }
    return recorded();
  };

  const tree = (state: AuraState, tab: string) => {
    const r = src.options(state, { tab });
    if (!r.tree) throw new Error(`The ${tab} tab doesn't build: ${r.error}`);
    return r.tree;
  };

  /**
   * The aura as the addon keeps it once a tab's set() has run: some set() calls also write settings the new aura
   * doesn't have yet (a group's anchor, its children's text formats). Setting a few options of the tab to the value
   * they show does just that, so probes on the settled aura show only what each option writes. An edit that changes
   * which options the window shows (writing a default can: WeakAuras2's `disjunctive` hides a text's time formats) is
   * not kept: the settled aura shows the new aura's options.
   */
  const shownCache = new Map<string, string>();
  const shown = (state: AuraState) => {
    const key = JSON.stringify(state);
    let s = shownCache.get(key);
    if (s === undefined) {
      s = JSON.stringify(src.options(state).tabs.map(({ key: tab }) => walk(tree(state, tab)).filter(isReferenced).map((n) => n.path)));
      shownCache.set(key, s);
    }
    return s;
  };
  const settle = (state: AuraState, tab: string): AuraState => {
    const nodes = walk(tree(state, tab)).filter((n) => n.canSet && !n.hidden && !n.disabled);
    const selects = nodes.filter((n) => n.type === "select" && (n.values ?? []).some(([k]) => k === n.value));
    const toggles = nodes.filter((n) => n.type === "toggle" && typeof n.value === "boolean");
    let options: string | undefined;
    for (const same of [...selects, ...toggles].slice(0, 4)) {
      const r = edit(state, tab, same, same.value);
      if (!r.edit?.changed) continue;
      const next = { aura: r.edit.aura, children: r.edit.children ?? state.children };
      options ??= shown(state);
      if (shown(next) === options) state = next;
    }
    return state;
  };

  /**
   * Probes every option of a tab on `state` (only those whose path isn't in `known`), each from `state`. Choices of
   * selects with `choices` are followed one level: the options each choice reveals are probed with `after` in their
   * scope.
   */
  const probeTab = async (state: AuraState, tab: string, scope: OptionScope, known = new Set<string>(), follow = true) => {
    collectArrays(state.aura);
    const nodes = walk(tree(state, tab)).filter(isReferenced);
    const here = new Set(nodes.map((n) => JSON.stringify(n.path)));
    for (const node of nodes) {
      if (known.has(JSON.stringify(node.path))) continue;
      await breathe();
      const entry = probe(state, tab, node, scope);
      if (!follow) continue;
      for (const choice of entry.choices ?? []) {
        const key = JSON.stringify([scope.regionType, tab, node.path, choice.wrote]);
        if (followed.has(key)) continue;
        followed.add(key);
        const c = edit(state, tab, node, choice.value);
        if (!c.edit?.changed) continue;
        const chosen = { aura: c.edit.aura, children: c.edit.children ?? state.children };
        await probeTab(chosen, tab, { ...scope, after: { option: node.path, name: node.name ?? node.key, choice: choice.label } }, here, false);
      }
    }
    return here;
  };

  const page = src.newAuraPage();
  const regionTypes = page.types.map((t) => t.regionType);
  let tabs: OptionTab[] = [];
  // Warm-up: the addon sets some things up lazily the first time an aura of a kind is edited (a group's first edit
  // writes less than every later one). Editing each display type's tabs once first makes every probe see the
  // addon as it is after first use.
  for (const regionType of regionTypes) {
    const fresh = newReferenceState(src, regionType);
    for (const { key } of src.options(fresh).tabs) {
      settle(fresh, key);
      await breathe();
    }
  }
  for (const regionType of regionTypes) {
    const fresh = newReferenceState(src, regionType);
    const list = src.options(fresh).tabs;
    // Settled on every tab first: what any tab's set() writes on its own (a group's anchor) is then in every base.
    const base = list.reduce((state, { key }) => settle(state, key), fresh);
    if (list.length > tabs.length) tabs = list;
    for (const { key: tab } of list) {
      const settled = settle(base, tab);
      const known = await probeTab(settled, tab, { regionType });
      // Parts added with the tab's Add buttons (sub elements, conditions, triggers, actions, …): their new options.
      for (const button of walk(tree(settled, tab)).filter(isAdd)) {
        const r = edit(settled, tab, button, undefined, false);
        if (!r.edit?.changed) continue;
        const added = settle({ aura: r.edit.aura, children: r.edit.children ?? settled.children }, tab);
        await probeTab(added, tab, { regionType, added: { option: button.path, name: button.name ?? button.key } }, known);
      }
    }
  }

  // Every trigger type, and every event of a trigger type with sub types, on an icon's trigger 1.
  const triggerTypes: OptionReference["triggerTypes"] = [];
  const icon = newReferenceState(src, regionTypes.includes("icon") ? "icon" : regionTypes[0]);
  const typeSelect = walk(tree(icon, "trigger")).find((n) => n.type === "select" && /^trigger\.1\.[^.]+\.type$/.test(n.key));
  for (const [type, label] of typeSelect?.values ?? []) {
    const r = edit(icon, "trigger", typeSelect!, type);
    if (!r.edit) continue;
    const typed = settle({ aura: r.edit.aura, children: [] }, "trigger");
    const sub = walk(tree(typed, "trigger")).find((n) => n.type === "select" && /^trigger\.1\.[^.]+\.event$/.test(n.key) && !n.hidden);
    triggerTypes.push({ type: String(type), label, ...(sub?.values && { events: sub.values }) });
    const triggerType = String(type);
    if (!sub?.values) {
      await probeTab(typed, "trigger", { regionType: icon.aura.regionType as string, triggerType });
      continue;
    }
    for (const [event] of sub.values) {
      const e = event === sub.value ? undefined : edit(typed, "trigger", sub, event).edit;
      const state = e ? settle({ aura: e.aura, children: [] }, "trigger") : typed;
      await probeTab(state, "trigger", { regionType: icon.aura.regionType as string, triggerType, event: String(event) });
    }
  }

  const byPath: Record<string, number[]> = {};
  const byChildPath: Record<string, number[]> = {};
  const index = (into: Record<string, number[]>, paths: TablePath[] | undefined, i: number) => {
    for (const p of new Set((paths ?? []).map(pathPattern))) (into[p] ??= []).push(i);
  };
  entries.forEach((e, i) => {
    index(byPath, e.writes, i);
    index(byChildPath, e.childWrites, i);
  });
  return { format: OPTION_REFERENCE_FORMAT, ref: src.ref, generatedMs: Math.round(now() - t0), tabs, regionTypes, triggerTypes, entries, byPath, byChildPath, lists: [...asList].filter((p) => !asObject.has(p)).sort() };
}
