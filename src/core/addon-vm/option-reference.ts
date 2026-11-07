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
 * icon, every trigger type and event. A select whose choice writes more than its own key (Grow also writes selfPoint)
 * records what every choice writes.
 *
 * Hidden options: the window hides many options of a new aura (a closed section, a field behind a toggle or a mode).
 * Before a tab's options are probed, each closed section is opened once, then with every section open each other
 * value of each shown toggle and short select is set once: what shows a hidden option is its `shownBy`, and an option
 * whose name changes with another option's value (a sub element's xOffset: "Extra Width" with Anchor Mode "Fill
 * Area", "X Offset" with "Attach to Point") records the other name in `modes`. One setting at a time: an option that
 * needs two is left without `shownBy`.
 *
 * The Conditions tab (`conditions`) is generated apart, since If and Then depend on the trigger and the display:
 * for every trigger type and event on an icon's trigger 1, a new condition's every If choice of the trigger (and the
 * global checks once) with the op and value fields it reveals; then the checks other Trigger tab options offer
 * (each toggle flipped and each choice of each select up to 40 values, one at a time from the new trigger: e.g.
 * Aura(s) Found once Show On is Always). And per display type, with one sub element of each kind its Add buttons add,
 * every Then choice and its value fields. Checks aren't probed per display type (the If list doesn't depend on it),
 * nor properties per trigger type, which keeps it to a third of the generation time.
 *
 * The reverse index is keyed by path patterns: every number segment replaced by `#` (`triggers.#.trigger.type`), so
 * any trigger's, condition's or sub element's key finds its options.
 */
import { plainText } from "../wow-text";
import { isLuaTable, keyFromString, type AuraDocument, type AuraState, type LuaKey, type LuaValue } from "../lua-value";
import type { NewAuraPage } from "./new-aura";
import type { OptionAddress, OptionEdit, OptionNode, OptionsRequest, OptionsTree, OptionTab } from "./options";

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

/** One setting of another option of the same tab: what shows a hidden option or changes its name. */
export interface OptionSetting {
  /** That option's key path in the tab, and its name. */
  option: string[];
  name: string;
  /** The value set (a select's key); absent for a button pressed (a section's expander). */
  value?: unknown;
  /** A select's label of `value`. */
  label?: string;
  /** The button opens a closed section of the tab (the window's expanders). */
  section?: boolean;
  /** The option is in closed sections too: their expanders, pressed first. */
  openSections?: { option: string[]; name: string }[];
}

/** An option's name and description while another option has a value (`when`, set with the sections open). */
export interface OptionMode {
  when: OptionSetting;
  name: string;
  desc?: string;
}

/** One choice of a select whose choices write more than its own key (a condition's If: each check; Grow: selfPoint too). */
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
  /**
   * What shows a hidden option: each is one setting that does (a section's expander opened, or another option set to
   * a value once the sections are open). Absent on a hidden option: no single setting shows it.
   */
  shownBy?: OptionSetting[];
  /**
   * Other names (and descriptions) the option has while another option has a value: the same key read in another
   * mode (a sub element's X Offset is "Extra Width" while its Anchor Mode is "Fill Area", which the probe saw).
   */
  modes?: OptionMode[];
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

/** An option a condition's If or Then choice reveals (a check's op and value, a property's value): as an entry. */
export type ConditionField = Omit<OptionReferenceEntry, "tab" | "scopes" | "choices">;

/** One choice of a condition's If (a check) or Then (a property): what choosing it writes and the options it reveals. */
export interface ConditionChoice {
  /** The select's value (an index into the addon's list: write `wrote`, not this). */
  value: LuaKey;
  label: string;
  /** Every table path choosing it changes on condition 1 (and change 1). */
  writes: TablePath[];
  /** What choosing it writes (tables leave their value out). */
  wrote: Record<TablePath, unknown>;
  /** The options it reveals, each probed once on the chosen condition. */
  fields: ConditionField[];
}

/** What a check's value is, read from the options its choice reveals. */
export type ConditionValueType = "bool" | "number" | "text" | "select" | "none" | "other";

/** One check of a condition's If: a condition variable of a trigger (or a global check, or a combination). */
export interface ConditionCheck extends ConditionChoice {
  /** The heading of If it is under ("Trigger 1: Aura", "Global Conditions", "Combinations"). */
  group?: string;
  /** `check.trigger` and `check.variable` it writes. */
  trigger?: number;
  variable?: string;
  valueType: ConditionValueType;
  /** `check.op`'s choices, when it has one. */
  operators?: [LuaKey, string][];
  /** `check.value`'s choices, when it is a select (a bool's `0`/`1`). */
  values?: [LuaKey, string][];
  /**
   * Offered only once a Trigger tab option is set (e.g. "Aura(s) Found" once Show is "Always"): that option, the value
   * set and what setting it wrote. Absent: the trigger type (and event) offers it as New Aura sets it up.
   */
  requires?: { option: string[]; name: string; value: unknown; wrote: Record<TablePath, unknown> };
}

/** The If checks of one trigger type (and event) on trigger 1. */
export interface ConditionCheckSet {
  triggerType: string;
  event?: string;
  checks: ConditionCheck[];
}

/** One property of a condition's Then (`changes.N.property`) and the options for its value. */
export interface ConditionProperty extends ConditionChoice {
  /** `changes.1.property` it writes (`alpha`, `sub.3.glow`, …). */
  property?: string;
}

/** A display type's Then properties, with one sub element of every kind it can add. */
export interface ConditionPropertySet {
  regionType: string;
  /** The Add button of the Conditions tab that added the condition (a Forever group has its own). */
  added: { option: string[]; name: string };
  /** The aura's sub elements when probed (`sub.N` is the N-th): its New Aura ones, then one of each Add button's. */
  subRegions: { index: number; type: string }[];
  properties: ConditionProperty[];
}

/**
 * The Conditions tab per trigger type and display type. Checks are probed per trigger type and event on an icon
 * (the If list depends only on the triggers); properties per display type with one sub element of each kind added
 * (the Then list depends only on the display and its elements).
 */
export interface ConditionReference {
  /** The display type the checks were probed on. */
  regionType: string;
  /** The checks of every aura: global checks and the combinations (All of, Any of). */
  global: ConditionCheck[];
  checks: ConditionCheckSet[];
  properties: ConditionPropertySet[];
}

/** The reference's shape and generator version: changes when either does (caches keyed by it regenerate). */
export const OPTION_REFERENCE_FORMAT = 6;

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
  /** Every condition check per trigger type and event, and every condition property per display type. */
  conditions: ConditionReference;
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
  options(state: AuraState, request?: OptionsRequest): OptionsTree;
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

/** The node at an option path in a tree, if it is there. */
function nodeAt(root: OptionNode, path: string[]): OptionNode | undefined {
  const key = JSON.stringify(path);
  return walk(root).find((n) => JSON.stringify(n.path) === key);
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

/** Whether a select's choice `value` is written as itself at one of the changed paths (not an index into a list). */
function isPlainChoice(after: LuaValue, changed: TablePath[], value: unknown): boolean {
  return changed.some((p) => {
    const v = valueAt(after, p);
    return sameJson(v, value) || sameJson(v, [value]);
  });
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
/** The most choices a select may have to be tried as a mode of other options (Anchor Mode, Grow, a trigger's type). */
const MODE_CHOICES = 12;
const truthy = (v: unknown) => v !== undefined && v !== null && v !== false;

/** What shows the options of a tab and their other names, by option path (JSON). */
interface Revealed {
  shownBy: OptionSetting[];
  modes: OptionMode[];
}
const isAdd = (n: OptionNode) => n.type === "execute" && n.canRun === true && !n.hidden && !n.disabled && (/^Add\b/.test(n.name ?? "") || /(^|\\)add$/i.test(n.image ?? ""));

function defaultOf(node: OptionNode): unknown {
  if (node.type === "multiselect" && Array.isArray(node.value)) return (node.value as [LuaKey, boolean][]).filter(([, v]) => v).map(([k]) => k);
  return node.value;
}

/** `o` without key `k`. */
const omit = <T extends object, K extends keyof T>(o: T, k: K): Omit<T, K> => {
  const copy = { ...o };
  delete copy[k];
  return copy;
};

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

/** Generates the reference for the addon version `src` runs: tens of thousands of probe edits, about two minutes. */
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
    const paths = new Set<TablePath>();
    e.state.children.forEach((c, i) => {
      if (c !== state.children[i]) changedPaths(state.children[i], c).forEach((p) => paths.add(p));
    });
    return paths.size ? [...paths].sort() : undefined;
  };

  /** Choices already followed (same display type, tab, option and written values). */
  const followed = new Set<string>();

  /**
   * Probes one option on `state` and records it under `scope` (merged with an identical entry from elsewhere).
   * Every place is probed on its own: the same option can write more on another aura (a text aura's trigger type also
   * writes its automaticWidth; Add Trigger also normalizes trigger 1 of some trigger types).
   */
  const probe = (state: AuraState, tab: string, node: OptionNode, scope: OptionScope, reveal?: Revealed): OptionReferenceEntry => {
    const entry = measure(state, tab, node);
    if (reveal?.shownBy.length && entry.hidden) entry.shownBy = reveal.shownBy;
    if (reveal?.modes.length) entry.modes = reveal.modes;
    return entries[add(entry, scope)];
  };

  /**
   * What shows each hidden option of a tab, and the other names options take, on `state`: each closed section opened
   * (the options it shows), then, with every section open, each other value of each shown toggle and of each select of
   * up to `MODE_CHOICES` values (the options it shows, the names that change). The window's sections are put back after.
   * `known`: options already probed on the aura before a part was added (Add Glow, …): only the new options are asked
   * about, and only the new options and the sections are tried as what shows them (a part's options are shown by the
   * part's own).
   */
  const revealedCache = new Map<string, Map<string, Revealed>>();
  const revealed = (state: AuraState, tab: string, known: ReadonlySet<string>): Map<string, Revealed> => {
    // A tab that shows the same options with the same values (the Load tab of every display type) reveals the same.
    const { ms: _ms, ...root } = tree(state, tab);
    void _ms;
    const cacheKey = `${tab}\n${JSON.stringify(root)}\n${JSON.stringify([...known])}`;
    const cached = revealedCache.get(cacheKey);
    if (cached) return cached;
    const out = new Map<string, Revealed>();
    revealedCache.set(cacheKey, out);
    const at = (key: string) => {
      let r = out.get(key);
      if (!r) out.set(key, (r = { shownBy: [], modes: [] }));
      return r;
    };
    const view = (s: AuraState) => new Map(walk(tree(s, tab)).map((n) => [JSON.stringify(n.path), n]));
    const setting = (n: OptionNode, value?: unknown): OptionSetting => {
      const label = n.type === "select" ? n.values?.find(([k]) => k === value)?.[1] : undefined;
      return {
        option: n.path,
        name: plainText(n.name ?? n.key).trim(),
        ...(value !== undefined && { value }),
        ...(label !== undefined && { label: plainText(label).trim() }),
        ...(n.type === "execute" && { section: true }),
      };
    };
    const asked = new Set([...view(state)].filter(([k, n]) => isReferenced(n) && n.hidden && !known.has(k)).map(([k]) => k));
    /** The sections opened (their expanders). */
    const opened: OptionNode[] = [];
    src.keepSections(() => {
      // Sections: each expander pressed once; one that hid options was open, and is pressed again.
      let shown = view(state);
      for (const expander of [...shown.values()].filter((n) => isExpander(n) && n.canRun === true && !n.hidden)) {
        try {
          src.setOption(state, { tab, path: expander.path }, undefined);
        } catch {
          continue;
        }
        const next = view(state);
        if ([...shown].some(([k, n]) => !n.hidden && next.get(k)?.hidden)) {
          src.setOption(state, { tab, path: expander.path }, undefined);
          continue;
        }
        opened.push(expander);
        for (const k of asked) {
          if (shown.get(k)?.hidden && next.get(k) && !next.get(k)!.hidden) at(k).shownBy.push(setting(expander));
        }
        shown = next;
      }
      // Modes: every other value of each shown toggle and short select, with the sections open.
      const modes = [...shown.values()].filter(
        (n) =>
          !known.has(JSON.stringify(n.path)) &&
          n.canSet === true &&
          !n.hidden &&
          !n.disabled &&
          (n.type === "toggle" || (n.type === "select" && (n.values?.length ?? 0) <= MODE_CHOICES)),
      );
      for (const mode of modes) {
        const values = mode.type === "toggle" ? [!truthy(mode.value)] : (mode.values ?? []).map(([k]) => k).filter((k) => k !== mode.value);
        for (const v of values) {
          let edit: OptionEdit;
          try {
            edit = src.setOption(state, { tab, path: mode.path }, v);
          } catch {
            continue;
          }
          if (!edit.changed) continue;
          const next = view(edit.state);
          const shows: string[] = [];
          for (const [k, before] of shown) {
            const after = next.get(k);
            if (!after || k === JSON.stringify(mode.path) || !isReferenced(before)) continue;
            if (asked.has(k) && before.hidden && !after.hidden) shows.push(k);
            const name = plainText(after.name ?? after.key).trim();
            if (!before.hidden && !after.hidden && name !== plainText(before.name ?? before.key).trim()) {
              at(k).modes.push({ when: setting(mode, v), name, ...(after.desc && after.desc !== before.desc && { desc: after.desc }) });
            }
          }
          // The sections each shown option needs open too: those that hide it again when closed alone.
          const sections = new Map<string, OptionNode[]>(shows.map((k) => [k, []]));
          for (const expander of shows.length ? opened : []) {
            // A mode can remove a section with its options (another trigger type): only those still there.
            if (!next.has(JSON.stringify(expander.path))) continue;
            src.setOption(edit.state, { tab, path: expander.path }, undefined);
            const closed = view(edit.state);
            src.setOption(edit.state, { tab, path: expander.path }, undefined);
            for (const k of shows) if (closed.get(k)?.hidden) sections.get(k)!.push(expander);
          }
          for (const [k, needed] of sections) {
            const openSections = needed.map((e) => ({ option: e.path, name: plainText(e.name ?? e.key).trim() }));
            at(k).shownBy.push({ ...setting(mode, v), ...(openSections.length && { openSections }) });
          }
        }
      }
    });
    return out;
  };

  /** One option's entry (not recorded): its facts, and what its probe edit (and each choice) wrote on `state`. */
  const measure = (state: AuraState, tab: string, node: OptionNode, choices = true): Omit<OptionReferenceEntry, "scopes"> => {
    const entry: Omit<OptionReferenceEntry, "scopes"> = { tab, option: node.path, type: node.type, writes: [] };
    for (const f of ["name", "desc", "control", "min", "max", "softMin", "softMax", "step", "bigStep", "isPercent", "hasAlpha"] as const) {
      if (node[f] !== undefined && node[f] !== "") (entry as Record<string, unknown>)[f] = node[f];
    }
    if (node.multiline) entry.multiline = true;
    if (node.values) entry.values = node.values;
    if (node.type !== "execute" && node.value !== undefined) entry.default = defaultOf(node);
    if (node.hidden) entry.hidden = true;
    const recorded = () => entry;

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
    collectArrays(e.state.aura);
    const value = r.value;
    const changed = changedPaths(state.aura, e.state.aura).sort();
    entry.writes = changed;
    if (node.type === "multiselect") {
      const key = String((value as [LuaKey])[0]);
      entry.writes = changed.map((p) => p.split(".").map((seg) => (seg === key ? "*" : seg)).join("."));
    }
    const childWrites = childDiff(state, e);
    if (childWrites) entry.childWrites = childWrites;
    if (node.type !== "execute") entry.probe = { value, wrote: wroteOf(e.state.aura, changed) };
    if (e.dialog) entry.dialog = e.dialog.kind;
    // A select whose choice writes something other than its key (e.g. an index into the condition checks), or more
    // than its key (Grow also sets selfPoint): each choice's writes.
    if (choices && node.type === "select" && changed.length > 0 && node.values && node.values.length <= 300) {
      if (!isPlainChoice(e.state.aura, changed, value) || changed.length > 1) {
        entry.choices = [];
        for (const [v, label] of node.values) {
          // The choice the aura has writes nothing on it: it is chosen back from the probe's choice instead.
          const from = sameJson(v, node.value) ? e.state : state;
          const c = edit(from, tab, node, v);
          if (!c.edit) continue;
          entry.choices.push({ value: v, label, wrote: wroteOf(c.edit.state.aura, changedPaths(from.aura, c.edit.state.aura)) });
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
    let tried = 0;
    for (const same of [...selects, ...toggles]) {
      if (tried === 4) break;
      const r = edit(state, tab, same, same.value);
      const next = r.edit?.state;
      // Setting an option to the value it shows must leave it showing that value. A tristate toggle shows `false`
      // for "not set", and setting it to false means "Not" (a Load option's "Not Alive" unloads the aura): a real
      // change, so it is skipped and doesn't count.
      if (next && r.edit!.changed && !sameJson(nodeAt(tree(next, tab), same.path)?.value, same.value)) continue;
      tried++;
      if (!next || !r.edit!.changed) continue;
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
    const reveals = follow && nodes.some((n) => !known.has(JSON.stringify(n.path))) ? revealed(state, tab, known) : new Map<string, Revealed>();
    for (const node of nodes) {
      const key = JSON.stringify(node.path);
      if (known.has(key)) continue;
      await breathe();
      const entry = probe(state, tab, node, scope, reveals.get(key));
      if (!follow || !entry.probe) continue;
      // Followed: choices that write a whole setting rather than themselves (a condition's If), whose options differ.
      const { value: chosen, wrote } = entry.probe;
      if (Object.values(wrote).some((v) => sameJson(v, chosen) || sameJson(v, [chosen]))) continue;
      for (const choice of entry.choices ?? []) {
        const key = JSON.stringify([scope.regionType, tab, node.path, choice.wrote]);
        if (followed.has(key)) continue;
        followed.add(key);
        const c = edit(state, tab, node, choice.value);
        if (!c.edit?.changed) continue;
        const chosen = c.edit.state;
        await probeTab(chosen, tab, { ...scope, after: { option: node.path, name: node.name ?? node.key, choice: choice.label } }, here, false);
      }
    }
    return here;
  };

  const CONDITIONS = "conditions";

  /** `state` with a new condition from each Add button of the Conditions tab that adds one to the aura's own table. */
  const withCondition = (state: AuraState) =>
    walk(tree(state, CONDITIONS))
      .filter(isAdd)
      .flatMap((button) => {
        const r = edit(state, CONDITIONS, button, undefined, false);
        if (!r.edit?.changed || !changedPaths(state.aura, r.edit.state.aura).some((p) => p.split(".")[0] === "conditions")) return [];
        return [{ state: r.edit.state, added: { option: button.path, name: button.name ?? button.key } }];
      });

  /** The Conditions tab's select one of whose first choices writes `path` (If: the check's variable; Then: the property). */
  const selectWriting = (state: AuraState, path: TablePath) =>
    walk(tree(state, CONDITIONS)).find(
      (n) =>
        n.type === "select" &&
        n.canSet === true &&
        !n.hidden &&
        (n.values ?? []).slice(0, 6).some(([v]) => {
          const r = edit(state, CONDITIONS, n, v);
          return r.edit !== undefined && changedPaths(state.aura, r.edit.state.aura).includes(path);
        }),
    );

  /**
   * Every choice of a condition's If or Then select (`node` on `state`) that writes something, with the options it
   * reveals; a choice that writes nothing is a heading of the list, given to the choices under it. `only`: those values.
   */
  const measuredFields = new Map<string, ConditionField>();
  const conditionChoices = async (state: AuraState, node: OptionNode, only?: Set<LuaKey>) => {
    const before = new Set(walk(tree(state, CONDITIONS)).map((n) => JSON.stringify(n.path)));
    const out: (ConditionChoice & { group?: string })[] = [];
    let group: string | undefined;
    for (const [value, label] of node.values ?? []) {
      if (only && !only.has(value)) continue;
      await breathe();
      const r = edit(state, CONDITIONS, node, value);
      if (!r.edit) continue;
      if (!r.edit.changed) {
        group = plainText(label).trim();
        continue;
      }
      const chosen = r.edit.state;
      collectArrays(chosen.aura);
      const changed = changedPaths(state.aura, chosen.aura).sort();
      const fields = walk(tree(chosen, CONDITIONS))
        .filter((n) => isReferenced(n) && n.type !== "execute" && !before.has(JSON.stringify(n.path)))
        .map((n) => {
          // The same option (the same op or value field of another check or property) writes the same: probed once.
          // Not a text field: whether it takes text or only numbers (its validate()) doesn't show.
          const key = n.type === "input" ? undefined : JSON.stringify(n);
          let field = key === undefined ? undefined : measuredFields.get(key);
          if (!field) {
            field = omit(measure(chosen, CONDITIONS, n, false), "tab");
            if (key !== undefined) measuredFields.set(key, field);
          }
          return field;
        });
      out.push({ value, label: plainText(label).trim(), writes: changed, wrote: wroteOf(chosen.aura, changed), fields, ...(group && { group }) });
    }
    return out;
  };

  const lastKey = (wrote: Record<TablePath, unknown>, key: string) => {
    const k = Object.keys(wrote).find((p) => p.endsWith(`.${key}`));
    return k === undefined ? undefined : wrote[k];
  };

  /** A check from an If choice: its trigger and variable, what its value is and its operators. */
  const checkOf = ({ group, ...choice }: ConditionChoice & { group?: string }): ConditionCheck => {
    const writing = (key: string) => choice.fields.find((f) => !f.hidden && f.writes.some((p) => p.endsWith(`.check.${key}`)));
    const op = writing("op");
    const value = writing("value");
    let valueType: ConditionValueType = "other";
    if (!value) valueType = "none";
    else if (value.type === "select") valueType = sameJson(value.values?.map(([k]) => k), [0, 1]) ? "bool" : "select";
    else if (value.type === "input" && !value.multiline) valueType = value.probe?.value === "5" ? "number" : "text";
    const trigger = lastKey(choice.wrote, "check.trigger");
    const variable = lastKey(choice.wrote, "check.variable");
    return {
      ...choice,
      ...(group && { group }),
      ...(typeof trigger === "number" && { trigger }),
      ...(typeof variable === "string" && { variable }),
      valueType,
      ...(op?.type === "select" && op.values && { operators: op.values }),
      ...(value?.type === "select" && value.values && { values: value.values }),
    };
  };

  const triggerKey = /^trigger\.1\.[^.]+\.(type|event)$/;

  /**
   * The Conditions tab, generated: every check of If per trigger type and event (on trigger 1 of an icon, with the
   * checks further Trigger tab options offer), and every property of Then per display type, with one sub element of
   * each kind the display can add.
   */
  const conditionReference = async (
    icon: AuraState,
    typed: { triggerType: string; event?: string; state: AuraState }[],
    regionTypes: string[],
  ): Promise<ConditionReference> => {
    const result: ConditionReference = { regionType: String(icon.aura.regionType), global: [], checks: [], properties: [] };
    let globalHead: [LuaKey, string][] = [];
    for (const { triggerType, event, state } of typed) {
      const [first] = withCondition(state);
      const ifNode = first && selectWriting(first.state, "conditions.1.check.variable");
      if (!ifNode) continue;
      const base = first.state;
      // The global checks and combinations head the list and are the same for every trigger: probed on the first
      // only (a trigger's own check can have a global one's label: Unit Characteristics' In Combat).
      const values = ifNode.values ?? [];
      const notGlobal = new Set(values.filter((v, i) => !sameJson(v, globalHead[i])).map(([k]) => k));
      const all = (await conditionChoices(base, ifNode, notGlobal)).map(checkOf);
      const checks = all.filter((c) => c.trigger === 1);
      if (globalHead.length === 0) {
        result.global = all.filter((c) => c.trigger !== 1);
        // Everything before the first own check's heading.
        const firstOwn = values.findIndex(([k]) => checks.some((c) => c.value === k));
        globalHead = values.slice(0, Math.max(0, firstOwn - 1));
      }
      const group = checks[0]?.group;
      const labels = new Set((ifNode.values ?? []).map(([, l]) => l));
      const variables = new Set(checks.map((c) => c.variable));
      // Checks other Trigger tab options offer: each toggle flipped, each choice of each select (up to 40), from the
      // trigger as New Aura sets it up; only edits that keep the trigger type and event.
      const options = walk(tree(base, "trigger")).filter(
        (n) =>
          n.canSet === true &&
          !n.hidden &&
          !n.disabled &&
          !triggerKey.test(n.key) &&
          (n.type === "toggle" || (n.type === "select" && (n.values?.length ?? 0) <= 40)),
      );
      for (const option of options) {
        const values = option.type === "toggle" ? [!truthy(option.value)] : (option.values ?? []).map(([k]) => k).filter((k) => k !== option.value);
        for (const v of values) {
          await breathe();
          const r = edit(base, "trigger", option, v);
          if (!r.edit?.changed) continue;
          const next = r.edit.state;
          const same = (key: string) => sameJson(valueAt(next.aura, `triggers.1.trigger.${key}`), valueAt(base.aura, `triggers.1.trigger.${key}`));
          if (!same("type") || !same("event")) continue;
          const nextIf = nodeAt(tree(next, CONDITIONS), ifNode.path);
          const fresh = (nextIf?.values ?? []).filter(([, l]) => !labels.has(l)).map(([k]) => k);
          if (!nextIf || fresh.length === 0) continue;
          // A label once seen is the same check (or one that isn't the trigger's) wherever it shows up again.
          for (const [, l] of nextIf.values ?? []) labels.add(l);
          const changed = changedPaths(base.aura, next.aura);
          for (const c of (await conditionChoices(next, nextIf, new Set(fresh))).map(checkOf)) {
            if (c.trigger !== 1 || variables.has(c.variable)) continue;
            variables.add(c.variable);
            checks.push({ ...c, ...(group && { group }), requires: { option: option.path, name: plainText(option.name ?? option.key).trim(), value: v, wrote: wroteOf(next.aura, changed) } });
          }
        }
      }
      result.checks.push({ triggerType, ...(event !== undefined && { event }), checks });
    }

    for (const regionType of regionTypes) {
      const fresh = newReferenceState(src, regionType);
      let state = src.options(fresh).tabs.reduce((s, { key }) => settle(s, key), fresh);
      // One sub element of each kind the display adds to its own table.
      for (const { path } of walk(tree(state, "region")).filter(isAdd)) {
        const button = nodeAt(tree(state, "region"), path);
        if (!button || !isAdd(button)) continue;
        const r = edit(state, "region", button, undefined, false);
        const count = (s: AuraState["aura"]) => (Array.isArray(s.subRegions) ? s.subRegions.length : 0);
        if (r.edit?.changed && count(r.edit.state.aura) > count(state.aura)) state = r.edit.state;
      }
      for (const { state: withOne, added } of withCondition(state)) {
        const thenNode = selectWriting(withOne, "conditions.1.changes.1.property");
        if (!thenNode) continue;
        const properties = (await conditionChoices(withOne, thenNode)).map((choice) => {
          const c = omit(choice, "group");
          const property = lastKey(c.wrote, "changes.1.property");
          return { ...c, ...(typeof property === "string" && { property }) };
        });
        const subs = Array.isArray(withOne.aura.subRegions) ? withOne.aura.subRegions : [];
        const subRegions = subs.map((s, i) => ({ index: i + 1, type: String(isLuaTable(s) && !Array.isArray(s) ? s.type : "") }));
        result.properties.push({ regionType, added, subRegions, properties });
      }
    }
    return result;
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
        const added = settle(r.edit.state, tab);
        await probeTab(added, tab, { regionType, added: { option: button.path, name: button.name ?? button.key } }, known);
      }
    }
  }

  // Every trigger type, and every event of a trigger type with sub types, on an icon's trigger 1.
  const triggerTypes: OptionReference["triggerTypes"] = [];
  const typedStates: { triggerType: string; event?: string; state: AuraState }[] = [];
  const icon = newReferenceState(src, regionTypes.includes("icon") ? "icon" : regionTypes[0]);
  const typeSelect = walk(tree(icon, "trigger")).find((n) => n.type === "select" && /^trigger\.1\.[^.]+\.type$/.test(n.key));
  for (const [type, label] of typeSelect?.values ?? []) {
    const r = edit(icon, "trigger", typeSelect!, type);
    if (!r.edit) continue;
    const typed = settle(r.edit.state, "trigger");
    const sub = walk(tree(typed, "trigger")).find((n) => n.type === "select" && /^trigger\.1\.[^.]+\.event$/.test(n.key) && !n.hidden);
    triggerTypes.push({ type: String(type), label, ...(sub?.values && { events: sub.values }) });
    const triggerType = String(type);
    if (!sub?.values) {
      typedStates.push({ triggerType, state: typed });
      await probeTab(typed, "trigger", { regionType: icon.aura.regionType as string, triggerType });
      continue;
    }
    for (const [event] of sub.values) {
      const e = event === sub.value ? undefined : edit(typed, "trigger", sub, event).edit;
      const state = e ? settle(e.state, "trigger") : typed;
      typedStates.push({ triggerType, event: String(event), state });
      await probeTab(state, "trigger", { regionType: icon.aura.regionType as string, triggerType, event: String(event) });
    }
  }

  const conditions = await conditionReference(icon, typedStates, regionTypes);

  const byPath: Record<string, number[]> = {};
  const byChildPath: Record<string, number[]> = {};
  const index = (into: Record<string, number[]>, paths: TablePath[] | undefined, i: number) => {
    for (const p of new Set((paths ?? []).map(pathPattern))) (into[p] ??= []).push(i);
  };
  entries.forEach((e, i) => {
    index(byPath, e.writes, i);
    index(byChildPath, e.childWrites, i);
  });
  return { format: OPTION_REFERENCE_FORMAT, ref: src.ref, generatedMs: Math.round(now() - t0), tabs, regionTypes, triggerTypes, entries, conditions, byPath, byChildPath, lists: [...asList].filter((p) => !asObject.has(p)).sort() };
}
