/**
 * The options editor's data: the in-game options window's tabs and, per tab, the addon's own
 * AceConfig option tree evaluated for one aura (see lua/options.ts). Plain JSON, safe to post
 * between a Web Worker and the page.
 */
import type { LuaKey } from "../lua-value";

/** Option key path inside a tab. Keys are the addon's own, with `table: 0x…` parts replaced by `@`. */
export type OptionPath = string[];

/** Where an option lives: a tab of the options window and the path inside it. */
export interface OptionAddress {
  tab: string;
  path: OptionPath;
}

/** One AceConfig option, evaluated the way AceConfigDialog would for the aura. */
export interface OptionNode {
  /** The last key of `path` (unique among its siblings). */
  key: string;
  path: OptionPath;
  /** AceConfig type: group, input, range, toggle, select, multiselect, color, execute, description, header, … */
  type: string;
  name?: string;
  desc?: string;
  order: number;
  /** "full", "double", "half", "normal" or a multiple of the normal width. */
  width?: string | number;
  /** Choices of select/multiselect, in the order the game's dropdown lists them: [key, label]. */
  values?: [LuaKey, string][];
  min?: number;
  max?: number;
  softMin?: number;
  softMax?: number;
  step?: number;
  bigStep?: number;
  isPercent?: boolean;
  hasAlpha?: boolean;
  multiline?: boolean | number;
  fontSize?: string;
  inline?: boolean;
  /** The addon's widget for this option (e.g. WeakAurasExpand, WeakAurasInputFocus, LSM30_Font). */
  control?: string;
  dialogControl?: string;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  hidden?: boolean;
  disabled?: boolean;
  /**
   * The current value from the option's get(): string/number/boolean; colours as [r, g, b, a]
   * (0..1); multiselect as [key, checked] pairs.
   */
  value?: unknown;
  /** The option has a set() (editable). */
  canSet?: boolean;
  /** An execute option with a func() (button). */
  canRun?: boolean;
  /**
   * Fields whose evaluation failed inside the VM (usually a client API the simulated client can't
   * answer). An option with a `get` error is shown disabled with a note.
   */
  errors?: Partial<Record<string, string>>;
  /** Children of a group, sorted by order. */
  args?: OptionNode[];
  /** Milliseconds the evaluation took (root only). */
  ms?: number;
}

export interface OptionTab {
  /** The options window's own tab value: region, trigger, conditions, action, animation, load, … */
  key: string;
  /** The tab's label as the game shows it (Display, Trigger, …). */
  label: string;
}

export interface OptionsTree {
  /** The tabs the options window shows for this aura, in the window's order. */
  tabs: OptionTab[];
  /** The requested tab. */
  tab: string;
  /** Its evaluated option tree, or why it couldn't be built. */
  tree?: OptionNode;
  error?: string;
  /** WeakAuras.doubleWidth: the width of a full row in `width` units. */
  fullWidth: number;
}

export interface OptionEdit<Doc> {
  /** The aura after the edit: the document as given, plus what the edit changed. */
  aura: Doc;
  /**
   * A group's descendants after the edit, in the order given, when the edit changed any of them (a group's Display,
   * Trigger, … tabs edit its children, as in the game).
   */
  children?: Doc[];
  /** False when the edit only changed the editor (e.g. expanding a section). */
  changed: boolean;
  /** The addon raised an error during the edit, but the change it made so far was kept (as in the game). */
  warning?: string;
  /**
   * The button opened one of the window's dialogs (icon, texture or model picker, code editor, a confirmation). The
   * page shows its own and sends the choice back with the same button: `setOption(state, { tab, path: button }, choice)`
   * (a confirmation: `true`).
   */
  dialog?: OptionDialog;
}

/** A dialog a button of the options window opens, with what the page needs to show it. */
export type OptionDialog =
  | { kind: "icon"; current?: string | number }
  | { kind: "texture"; property?: string; current?: string | number; categories: { name: string; textures: [path: string, name: string][] }[] }
  | { kind: "model"; current?: string | number }
  | { kind: "text"; current: string; title?: string; url?: string; lua: boolean }
  | { kind: "confirm"; text: string; accept: string; cancel: string }
  | { kind: "textReplacements" }
  | { kind: "unsupported"; message: string };

/** The VM's JSON writes empty Lua tables as `{}`; makes the dialog's lists arrays again. */
export function normalizeDialog(dialog: OptionDialog): OptionDialog {
  if (dialog.kind === "texture") {
    const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
    dialog.categories = list<(typeof dialog.categories)[number]>(dialog.categories).map((c) => ({ ...c, textures: list(c.textures) }));
  }
  return dialog;
}

export interface TabSource {
  key: string;
  /** Untranslated label (a key of WeakAuras.L). */
  label: string;
  /** OptionsPrivate generator, e.g. GetDisplayOptions. */
  fn: string;
  /** Only shown for groups. */
  groupOnly: boolean;
}

/**
 * Reads the options window's tab list and the generator per tab from its own source
 * (WeakAurasOptions/OptionsFrames/OptionsFrame.lua: `local tabs = {…}` in FillOptions and
 * `optionsGenerator` in EnsureOptions), so the editor follows the addon when tabs change.
 * Returns undefined when the source no longer has that shape.
 */
export function parseOptionTabs(optionsFrameLua: string): TabSource[] | undefined {
  const generators = /optionsGenerator\s*=\s*\{([\s\S]*?)\}/.exec(optionsFrameLua);
  const list = /local\s+tabs\s*=\s*\{([\s\S]*?)\n\s*\}/.exec(optionsFrameLua);
  if (!generators || !list) return undefined;
  const fnOf = new Map<string, string>();
  for (const m of generators[1].matchAll(/(\w+)\s*=\s*OptionsPrivate\.(\w+)/g)) fnOf.set(m[1], m[2]);
  const entry = /\{\s*value\s*=\s*"(\w+)"\s*,\s*text\s*=\s*L\["([^"]+)"\]\s*\}/g;
  const tabs: TabSource[] = [];
  for (const m of list[1].matchAll(entry)) {
    const fn = fnOf.get(m[1]);
    if (fn) tabs.push({ key: m[1], label: m[2], fn, groupOnly: false });
  }
  // Tabs inserted for groups only: tinsert(tabs, 1, { value = "group", text = L["Group"]})
  for (const m of optionsFrameLua.matchAll(/tinsert\(\s*tabs\s*,\s*(\d+)\s*,\s*(\{[^}]*\})\s*\)/g)) {
    const e = new RegExp(entry.source).exec(m[2]);
    const fn = e && fnOf.get(e[1]);
    if (e && fn) tabs.splice(Number(m[1]) - 1, 0, { key: e[1], label: e[2], fn, groupOnly: true });
  }
  return tabs.length > 0 ? tabs : undefined;
}

export const OPTIONS_FRAME_FILE = "OptionsFrames/OptionsFrame.lua";

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** The VM's JSON writes empty Lua tables as `{}`; makes every list field a JS array again. */
export function normalizeOptionNode(node: OptionNode): OptionNode {
  node.path = asArray<string>(node.path);
  if (node.values !== undefined) node.values = asArray(node.values);
  if (node.type === "multiselect" && node.value !== undefined) node.value = asArray(node.value);
  if (node.args !== undefined) node.args = asArray<OptionNode>(node.args).map(normalizeOptionNode);
  return node;
}

/** An edit the addon refused or couldn't apply (the message is shown next to the option). */
export class OptionEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptionEditError";
  }
}

/** One display type on the window's New Aura page (the addon's registered region options). */
export interface NewAuraType {
  /** regionType of the new aura: icon, aurabar, text, … */
  regionType: string;
  /** The game's name (Icon, Progress Bar, …). */
  displayName: string;
  description?: string;
  /** Texture path of the type's thumbnail, when the type registered one (the others draw theirs with frames). */
  icon?: string;
}

/** A button of the New Aura page that isn't a display type. */
export interface NewAuraButton {
  name: string;
  description: string;
  icon?: string;
}

/** What the window's New Aura page offers, read from the addon (OptionsFrame.lua frame.NewAura). */
export interface NewAuraPage {
  /** Display types in the page's order (group and dynamic group first, then by name). */
  types: NewAuraType[];
  /** The Modern Aura Group button: a group made with these settings. */
  modernGroup: NewAuraButton & { sourceData: Record<string, unknown> };
  packs: NewAuraButton;
  premade: NewAuraButton;
}

/** One pack of the window's Packs page, with its import data as an aura and its descendants. */
export interface AuraPack {
  name: string;
  description: string;
  icon?: string;
  /** The pack's state code, when the addon ships one (utility packs, whole class HUDs). */
  code?: string;
}

export interface AuraPackBlock extends AuraPack {
  label: string;
  /** Import data the addon builds for this block (BuildClassPackBlockImport): the group and its descendants. */
  aura: Record<string, unknown>;
  children: Record<string, unknown>[];
}

export interface AuraPacks {
  utility: (AuraPack & { category?: string })[];
  /** Class HUD packs per class token (DRUID, …): the whole HUD and its blocks. */
  classes: (AuraPack & { class: string; blocks: AuraPackBlock[] })[];
}
