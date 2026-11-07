import { Lua } from "wasmoon-lua5.1";
import { runLua } from "../lua-run";
import { normalizeNewlines, type AddonSourceFetcher } from "../addon-source";
import { AURA_CORE } from "../lua-glue";
import { LUA_STDLIB } from "../lua-stdlib";
import { canonicalize, isLuaTable, toLuaLiteral, type AuraDocument, type AuraState, type LuaObject, type LuaValue } from "../lua-value";
import { AddonContractError } from "./contract";
import { ADDON_VM_GAMES } from "./games";
import { BRIDGE_LUA } from "./lua/bridge";
import { EXTRACT_LUA } from "./lua/extract";
import type { AuraPacks, NewAuraPage } from "./new-aura";
import { DIALOGS_LUA } from "./lua/dialogs";
import { IMPORT_LUA } from "./lua/import";
import { NEW_AURA_LUA } from "./lua/new-aura";
import { OPTIONS_LUA } from "./lua/options";
import {
  OPTIONS_FRAME_FILE,
  OptionEditError,
  parseOptionTabs,
  type OptionAddress,
  type OptionEdit,
  type OptionNode,
  type OptionsRequest,
  type OptionsTree,
  type OptionTab,
} from "./options";
import { buildOptionReference, type OptionReference, type OptionReferenceOptions } from "./option-reference";
import { SHIM_LUA } from "./lua/shim";
import { spellsToLua, type ClientSpell } from "./spells";
import { FULL_VM_ADDONS as ADDONS, addonLoadOrder, type AddonGameId } from "./toc";
import { customLuaMessages, interpretValidation, mergeValidation, type RawValidation, type ValidationResult } from "./validation";

/** The addon's import dialog's answer: Import offered, or the dialog's reason it isn't. */
export type ImportCheck = { importable: true } | { importable: false; message: string };

/** Region and sub-region defaults and properties, trigger prototypes, Aura (Modern) registries. Plain JSON. */
export type Registries = Record<string, unknown> & { internalVersion: number; versionString: string };

export interface AddonVMReport {
  ref: string;
  /** Milliseconds: fetching sources, creating the VM, running each addon, total. */
  timings: { fetch: number; vmCreate: number; WeakAuras: number; WeakAurasOptions: number; total: number };
  files: number;
  sourceBytes: number;
  /** Files that raised an error while loading (the addon keeps going; most are harmless UI code). */
  fileErrors: { file: string; error: string }[];
  loginFinished: boolean;
  /** Client capability APIs answered by a permissive stub rather than the client profile. */
  stubbedProbes: string[];
  luaHeapBytes: number;
}

export interface AddonVM {
  readonly ref: string;
  readonly report: AddonVMReport;
  fillDefaults(state: AuraState): AuraState;
  validate(state: AuraState): ValidationResult;
  registries(): Registries;
  /** The options window's tabs and one tab's evaluated option tree for the selected aura of a top-level aura (AuraCore.options). */
  options(state: AuraState, request?: OptionsRequest): OptionsTree;
  /** Applies an edit to the selected aura through the option's own set() (or func()); returns the whole top-level aura. */
  setOption(state: AuraState, address: OptionAddress, value: unknown): OptionEdit;
  /** What the window's New Aura page offers (display types, Modern Aura Group, Packs, Premade Auras). */
  newAuraPage(): NewAuraPage;
  /** A new aura as WeakAuras.NewAura builds it (sourceData mixed in, e.g. the Modern Aura Group's settings). */
  newAura(regionType: string, sourceData?: LuaObject): AuraDocument;
  /** The Packs page: utility packs and every class's HUD pack with its blocks. Throws when the addon has none (WeakAuras2). */
  packs(): AuraPacks;
  /**
   * Whether the addon's own import (WeakAuras.Import and its import dialog) would offer to import this aura, and the
   * dialog's reason when it wouldn't (e.g. made with a newer version of the addon). `senderVersion`: the code's `s`
   * (the addon version that made it); without it the aura counts as made by this version.
   */
  importCheck(state: AuraState & { senderVersion?: string }): ImportCheck;
  /** Adds spells the client knows (C_Spell.GetSpellInfo and friends answer them; any other ID is nil). */
  setSpells(spells: Record<number, ClientSpell>): void;
  /**
   * The option ↔ table reference of this addon version: every option's table paths, type, values and default, and
   * the reverse index (option-reference.ts). Generated on first call by probe edits, then cached.
   */
  optionReference(options?: OptionReferenceOptions): Promise<OptionReference>;
  /** Frees the Lua VM. */
  dispose(): void;
}

export interface LoadAddonVMOptions {
  fetchSource: AddonSourceFetcher;
  wasmUri?: string;
  /** Which game's client the addon runs in (its .toc files, client profile and contract). Default "forever". */
  game?: AddonGameId;
}

const PROBE_NAMESPACES = /^(C_Secrets|C_CurveUtil|C_StringUtil|C_DurationUtil|C_NamePlate|C_UnitAuras|AuraUtil|Enum)\./;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Loads WeakAuras and WeakAurasOptions of one addon version into a fresh Lua VM, with the WoW API
 * shim and the game's client profile, runs login, and checks the addon contract.
 */
export async function loadAddonVM(ref: string, options: LoadAddonVMOptions): Promise<AddonVM> {
  const t0 = now();
  const { fetchSource } = options;
  const game = ADDON_VM_GAMES[options.game ?? "forever"];
  const plans = await Promise.all(
    ADDONS.map(async (addon) => {
      const { toc, files } = await addonLoadOrder(fetchSource, addon, game.id);
      const sources = await Promise.all(files.map(async (f) => normalizeNewlines(await fetchSource(`${addon}/${f}`))));
      return { addon, toc, files, sources };
    }),
  );
  const tFetched = now();

  const lua = await Lua.create(options.wasmUri ? { customWasmUri: options.wasmUri } : {});
  const tVm = now();
  runLua(lua, LUA_STDLIB);
  runLua(lua, SHIM_LUA);
  runLua(lua, BRIDGE_LUA);
  for (const chunk of game.profileLua) runLua(lua, chunk);

  const json = <T>(expr: string): T => JSON.parse(runLua(lua, `return __bridge.json(${expr})`) as string) as T;
  const fileErrors: AddonVMReport["fileErrors"] = [];
  const addonMs: Record<string, number> = {};
  let sourceBytes = 0;
  let loginFinished = false;
  const isLoginFinished = () => runLua(lua, "return WeakAuras and WeakAuras.IsLoginFinished and WeakAuras.IsLoginFinished() or false") === true;

  for (const [index, { addon, toc, files, sources }] of plans.entries()) {
    const tA = now();
    const name = JSON.stringify(addon);
    runLua(lua, `__shim.toc[${name}] = ${toLuaLiteral(toc.meta)}`);
    runLua(lua, `__shim.private[${name}] = __shim.private[${name}] or {}`);
    files.forEach((file, i) => {
      sourceBytes += sources[i].length;
      lua.global.set("__src", sources[i]);
      const r = json<{ status: string; error?: string }>(`__shim.runFile(${name}, ${JSON.stringify(file)})`);
      if (r.status !== "ok") fileErrors.push({ file: `${addon}/${file}`, error: r.error ?? r.status });
    });
    runLua(lua, `__shim.loadedAddons[${name}] = true`);
    // Game order: ADDON_LOADED after an addon's files; PLAYER_LOGIN once the core addon is in
    // (the options addon is load-on-demand and loads after login).
    runLua(lua, `__shim.fireSafe("ADDON_LOADED", ${name})`);
    if (index === 0) {
      runLua(lua, `__shim.fireSafe("PLAYER_LOGIN")`);
      runLua(lua, `__shim.fireSafe("PLAYER_ENTERING_WORLD", true, false)`);
      for (let ticks = 0; ticks < 500 && !isLoginFinished(); ticks += 10) runLua(lua, "__shim.tick(10)");
      loginFinished = isLoginFinished();
    }
    addonMs[addon] = now() - tA;
  }

  runLua(lua, AURA_CORE);
  runLua(lua, "__profile.afterLoad()");
  runLua(lua, EXTRACT_LUA);
  for (const chunk of game.extractLua) runLua(lua, chunk);
  runLua(lua, OPTIONS_LUA);
  runLua(lua, DIALOGS_LUA);
  runLua(lua, NEW_AURA_LUA);
  for (const chunk of game.newAuraLua) runLua(lua, chunk);
  runLua(lua, IMPORT_LUA);
  const hasPacks = runLua(lua, "return __options.packs ~= nil") === true;
  const optionsAddon = plans.find((p) => p.addon === "WeakAurasOptions");
  const frameIndex = optionsAddon?.files.indexOf(OPTIONS_FRAME_FILE) ?? -1;
  const tabSources = frameIndex >= 0 ? parseOptionTabs(optionsAddon!.sources[frameIndex]) : undefined;
  if (tabSources) {
    runLua(lua, 
      `__options.tabOrder = ${toLuaLiteral(tabSources.map((t) => t.key))}; __options.tabs = ${toLuaLiteral(
        Object.fromEntries(tabSources.map((t) => [t.key, { label: t.label, fn: t.fn, groupOnly: t.groupOnly }])),
      )}`,
    );
  }

  const missing = json<string[]>(`__extract.checkContract(${toLuaLiteral(game.contract as unknown as LuaValue)})`);
  if (Array.isArray(missing) && missing.length > 0) {
    lua.global.close();
    throw new AddonContractError(ref, missing, game.addonName);
  }
  if (!loginFinished) throw new Error(`${game.addonName} ${ref} did not finish logging in inside the simulated client`);
  runLua(lua, "__extract.installWarningRecorder()");

  const touched = json<Record<string, unknown>>("__shim.touched");
  const report: AddonVMReport = {
    ref,
    timings: {
      fetch: Math.round(tFetched - t0),
      vmCreate: Math.round(tVm - tFetched),
      WeakAuras: Math.round(addonMs.WeakAuras ?? 0),
      WeakAurasOptions: Math.round(addonMs.WeakAurasOptions ?? 0),
      total: Math.round(now() - t0),
    },
    files: plans.reduce((n, p) => n + p.files.length, 0),
    sourceBytes,
    fileErrors,
    loginFinished,
    stubbedProbes: Object.keys(touched).filter((k) => PROBE_NAMESPACES.test(k)).sort(),
    luaHeapBytes: Math.round((runLua(lua, 'collectgarbage("collect") return collectgarbage("count")') as number) * 1024),
  };

  const toAura = (doc: unknown): AuraDocument => {
    const c = canonicalize(doc as LuaValue);
    if (!isLuaTable(c) || Array.isArray(c)) throw new Error("An aura must be a table with string keys");
    return c;
  };
  const fill = (aura: AuraDocument): AuraDocument =>
    JSON.parse(runLua(lua, `return AuraCore.toJSON((__extract.prepare(${toLuaLiteral(toAura(aura))})))`) as string) as AuraDocument;
  const validateOne = (aura: AuraDocument): RawValidation => json<RawValidation>(`__extract.validate(${toLuaLiteral(toAura(aura))})`);
  let registriesCache: Registries | undefined;
  let packsCache: AuraPacks | undefined;
  const fullWidth = Number(runLua(lua, "return WeakAuras.doubleWidth or 2.6")) || 2.6;

  // The options editor works on a whole top-level aura (a group with everything in it), as the game's window has every
  // aura registered, and selects one aura in it. It stays registered in the VM between calls, so another tab or
  // another aura of it costs no load; it is loaded again only when the page sends a different top-level aura (an
  // edit's own result counts as loaded). What evaluating a tab writes into the VM's copy is put back before an edit
  // (lua/options.ts, restore).
  const stateKey = (state: AuraState) => JSON.stringify([state.aura, state.children]);
  let loadedKey: string | undefined;
  let loadWarning: string | undefined;
  const ensureSession = (state: AuraState, selected: string | undefined): string => {
    const key = stateKey(state);
    if (key !== loadedKey) {
      loadedKey = undefined;
      const r = json<{ ok: boolean; error?: string; warning?: string }>(
        `__options.load(${toLuaLiteral(toAura(state.aura))}, ${toLuaLiteral(state.children.map(toAura) as unknown as LuaValue)})`,
      );
      loadWarning = r.warning;
      if (!r.ok) throw new OptionEditError(r.error ?? "The addon could not load this aura into the editor");
      loadedKey = key;
    }
    const id = selected ?? state.aura.id;
    if (typeof id !== "string") throw new OptionEditError("The aura has no id");
    const r = json<{ ok: boolean; error?: string }>(`__options.select(${toLuaLiteral(id)})`);
    if (!r.ok) throw new OptionEditError([r.error ?? `There is no aura called ${id} in this aura`, loadWarning].filter(Boolean).join(": "));
    return id;
  };

  let referenceCache: Promise<OptionReference> | undefined;
  const vm: AddonVM = {
    ref,
    report,
    fillDefaults(state) {
      return { aura: fill(state.aura), children: state.children.map(fill) };
    },
    validate(state) {
      const auras = [state.aura, ...state.children];
      const ids = auras.map((aura) => (typeof aura.id === "string" ? aura.id : undefined));
      const isGroup = state.children.length > 0;
      const results = auras.map((aura, i) => {
        const auraId = isGroup ? ids[i] : undefined;
        const result = interpretValidation(validateOne(aura), { auraId, combatCheck: game.combatCheck });
        return { ...result, warnings: [...result.warnings, ...customLuaMessages(aura, auraId)] };
      });
      return mergeValidation(results, ids);
    },
    options(state, request) {
      const selected = ensureSession(state, request?.selected);
      const tabs = json<OptionTab[]>("__options.tabList()");
      const tab = request?.tab ?? tabs[0]?.key ?? "region";
      const base = { selected, tabs, tab, fullWidth, ...(loadWarning && { warning: loadWarning }) };
      if (tabSources === undefined) {
        return { ...base, error: `This addon version's options window (${OPTIONS_FRAME_FILE}) no longer has the tab list the editor reads` };
      }
      const r = json<{ tree?: OptionNode; error?: string }>(`__options.tree(${toLuaLiteral(tab)})`);
      return { ...base, ...r };
    },
    setOption(state, address, value) {
      ensureSession(state, address.selected);
      const v = value === undefined || value === null ? "nil" : toLuaLiteral(value as LuaValue);
      const r = json<{ ok: boolean; error?: string; changes?: { index: number; aura: AuraDocument }[]; selected?: string } & Pick<OptionEdit, "warning" | "dialog">>(
        `__options.edit(${toLuaLiteral(address.tab)}, ${toLuaLiteral(address.path)}, ${v})`,
      );
      if (!r.ok || r.changes === undefined || r.selected === undefined) throw new OptionEditError(r.error ?? "The edit failed");
      // The given documents, with the ones the edit changed replaced (the others stay the very objects given).
      const auras = [state.aura, ...state.children];
      for (const { index, aura } of r.changes) auras[index] = toAura(aura);
      const [aura, ...children] = auras;
      const edit: OptionEdit = {
        state: { aura, children },
        selected: r.selected,
        changed: r.changes.length > 0,
        ...(r.warning && { warning: r.warning }),
        ...(r.dialog && { dialog: r.dialog }),
      };
      if (edit.changed) loadedKey = stateKey(edit.state);
      return edit;
    },
    newAuraPage() {
      return json<NewAuraPage>("__options.newAuraTypes()");
    },
    newAura(regionType, sourceData) {
      const r = json<{ ok: boolean; error?: string; aura?: AuraDocument }>(
        `__options.newAura(${toLuaLiteral(regionType)}, ${sourceData ? toLuaLiteral(sourceData) : "nil"})`,
      );
      if (!r.ok || r.aura === undefined) throw new Error(r.error ?? "The addon made no aura");
      return toAura(r.aura);
    },
    packs() {
      if (!hasPacks) throw new Error(`${game.addonName} has no Packs page`);
      packsCache ??= json<AuraPacks>("__options.packs()");
      return packsCache;
    },
    importCheck(state) {
      const aura = toAura(state.aura);
      const children = state.children.map(toAura);
      // The transmit table's v, as Private.DisplayToString writes it (2000 when it holds nested groups).
      const v = children.some((c) => "controlledChildren" in c) ? 2000 : 1421;
      const transmit: LuaObject = { d: aura, v };
      if (children.length > 0) transmit.c = children;
      if (state.senderVersion !== undefined) transmit.s = state.senderVersion;
      const r = json<{ importable: boolean; message?: string }>(`__options.importCheck(${toLuaLiteral(transmit)})`);
      return r.importable ? { importable: true } : { importable: false, message: r.message ?? "The addon won't import this aura" };
    },
    setSpells(spells) {
      if (Object.keys(spells).length > 0) runLua(lua, spellsToLua(spells));
    },
    registries() {
      registriesCache ??= json<Registries>("__extract.registries()");
      return registriesCache;
    },
    optionReference(options) {
      const keepSections = <T>(fn: () => T): T => {
        runLua(lua, "__options.saveCollapsed()");
        try {
          return fn();
        } finally {
          runLua(lua, "__options.restoreCollapsed()");
        }
      };
      referenceCache ??= buildOptionReference({ ...vm, keepSections }, options);
      return referenceCache;
    },
    dispose() {
      lua.global.close();
    },
  };
  return vm;
}
