import { Lua } from "wasmoon-lua5.1";
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
import { NEW_AURA_LUA } from "./lua/new-aura";
import { OPTIONS_LUA } from "./lua/options";
import {
  OPTIONS_FRAME_FILE,
  OptionEditError,
  parseOptionTabs,
  type OptionAddress,
  type OptionEdit,
  type OptionNode,
  type OptionsTree,
  type OptionTab,
} from "./options";
import { buildOptionReference, type OptionReference, type OptionReferenceOptions } from "./option-reference";
import { SHIM_LUA } from "./lua/shim";
import { spellsToLua, type ClientSpell } from "./spells";
import { FULL_VM_ADDONS as ADDONS, addonLoadOrder, type AddonGameId } from "./toc";
import { interpretValidation, mergeValidation, type RawValidation, type ValidationResult } from "./validation";

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
  /** The options window's tabs and one tab's evaluated option tree for the aura (first tab by default). */
  options(state: AuraState, request?: { tab?: string }): OptionsTree;
  /** Applies an edit through the option's own set() (or runs an execute option's func()). */
  setOption(state: AuraState, address: OptionAddress, value: unknown): OptionEdit;
  /** What the window's New Aura page offers (display types, Modern Aura Group, Packs, Premade Auras). */
  newAuraPage(): NewAuraPage;
  /** A new aura as WeakAuras.NewAura builds it (sourceData mixed in, e.g. the Modern Aura Group's settings). */
  newAura(regionType: string, sourceData?: LuaObject): AuraDocument;
  /** The Packs page: utility packs and every class's HUD pack with its blocks. */
  packs(): AuraPacks;
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
  lua.doStringSync(LUA_STDLIB);
  lua.doStringSync(SHIM_LUA);
  lua.doStringSync(BRIDGE_LUA);
  for (const chunk of game.profileLua) lua.doStringSync(chunk);

  const json = <T>(expr: string): T => JSON.parse(lua.doStringSync(`return __bridge.json(${expr})`) as string) as T;
  const fileErrors: AddonVMReport["fileErrors"] = [];
  const addonMs: Record<string, number> = {};
  let sourceBytes = 0;
  let loginFinished = false;
  const isLoginFinished = () => lua.doStringSync("return WeakAuras and WeakAuras.IsLoginFinished and WeakAuras.IsLoginFinished() or false") === true;

  for (const [index, { addon, toc, files, sources }] of plans.entries()) {
    const tA = now();
    const name = JSON.stringify(addon);
    lua.doStringSync(`__shim.toc[${name}] = ${toLuaLiteral(toc.meta)}`);
    lua.doStringSync(`__shim.private[${name}] = __shim.private[${name}] or {}`);
    files.forEach((file, i) => {
      sourceBytes += sources[i].length;
      lua.global.set("__src", sources[i]);
      const r = json<{ status: string; error?: string }>(`__shim.runFile(${name}, ${JSON.stringify(file)})`);
      if (r.status !== "ok") fileErrors.push({ file: `${addon}/${file}`, error: r.error ?? r.status });
    });
    lua.doStringSync(`__shim.loadedAddons[${name}] = true`);
    // Game order: ADDON_LOADED after an addon's files; PLAYER_LOGIN once the core addon is in
    // (the options addon is load-on-demand and loads after login).
    lua.doStringSync(`__shim.fireSafe("ADDON_LOADED", ${name})`);
    if (index === 0) {
      lua.doStringSync(`__shim.fireSafe("PLAYER_LOGIN")`);
      lua.doStringSync(`__shim.fireSafe("PLAYER_ENTERING_WORLD", true, false)`);
      for (let ticks = 0; ticks < 500 && !isLoginFinished(); ticks += 10) lua.doStringSync("__shim.tick(10)");
      loginFinished = isLoginFinished();
    }
    addonMs[addon] = now() - tA;
  }

  lua.doStringSync(AURA_CORE);
  lua.doStringSync("__profile.afterLoad()");
  lua.doStringSync(EXTRACT_LUA);
  for (const chunk of game.extractLua) lua.doStringSync(chunk);
  lua.doStringSync(OPTIONS_LUA);
  lua.doStringSync(DIALOGS_LUA);
  lua.doStringSync(NEW_AURA_LUA);
  const optionsAddon = plans.find((p) => p.addon === "WeakAurasOptions");
  const frameIndex = optionsAddon?.files.indexOf(OPTIONS_FRAME_FILE) ?? -1;
  const tabSources = frameIndex >= 0 ? parseOptionTabs(optionsAddon!.sources[frameIndex]) : undefined;
  if (tabSources) {
    lua.doStringSync(
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
  lua.doStringSync("__extract.installWarningRecorder()");

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
    luaHeapBytes: Math.round((lua.doStringSync('collectgarbage("collect") return collectgarbage("count")') as number) * 1024),
  };

  const toAura = (doc: unknown): AuraDocument => {
    const c = canonicalize(doc as LuaValue);
    if (!isLuaTable(c) || Array.isArray(c)) throw new Error("An aura must be a table with string keys");
    return c;
  };
  const fill = (aura: AuraDocument): AuraDocument =>
    JSON.parse(lua.doStringSync(`return AuraCore.toJSON((__extract.prepare(${toLuaLiteral(toAura(aura))})))`) as string) as AuraDocument;
  const validateOne = (aura: AuraDocument): RawValidation => json<RawValidation>(`__extract.validate(${toLuaLiteral(toAura(aura))})`);
  let registriesCache: Registries | undefined;
  let packsCache: AuraPacks | undefined;
  const fullWidth = Number(lua.doStringSync("return WeakAuras.doubleWidth or 2.6")) || 2.6;

  // The aura the options editor works on stays registered in the VM between calls; it is loaded
  // again only when the page sends a different document.
  let loadedKey: string | undefined;
  const ensureSession = (state: AuraState) => {
    const aura = toAura(state.aura);
    const children = state.children.map(toAura);
    const key = JSON.stringify({ aura, children });
    if (key === loadedKey) return;
    const r = json<{ ok: boolean; error?: string }>(
      `__options.load(${toLuaLiteral(aura)}, ${toLuaLiteral(children as unknown as LuaValue)})`,
    );
    if (!r.ok) {
      loadedKey = undefined;
      throw new OptionEditError(r.error ?? "The addon could not load this aura into the editor");
    }
    loadedKey = key;
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
      const results = auras.map((aura, i) =>
        interpretValidation(validateOne(aura), { auraId: isGroup ? ids[i] : undefined, combatCheck: game.combatCheck }),
      );
      return mergeValidation(results, ids);
    },
    options(state, request) {
      ensureSession(state);
      const tabs = json<OptionTab[]>("__options.tabList()");
      const tab = request?.tab ?? tabs[0]?.key ?? "region";
      const base = { tabs, tab, fullWidth };
      if (tabSources === undefined) {
        return { ...base, error: `This addon version's options window (${OPTIONS_FRAME_FILE}) no longer has the tab list the editor reads` };
      }
      const r = json<{ tree?: OptionNode; error?: string }>(`__options.tree(${toLuaLiteral(tab)})`);
      // Evaluating a tab can write into the VM's copy of the aura (some get()s fill in defaults, a group's region
      // re-anchors), so the next call loads the document again: an edit always starts from the document as given.
      loadedKey = undefined;
      return { ...base, ...r };
    },
    setOption(state, address, value) {
      ensureSession(state);
      const v = value === undefined || value === null ? "nil" : toLuaLiteral(value as LuaValue);
      const r = json<Partial<OptionEdit> & { ok: boolean; error?: string }>(
        `__options.edit(${toLuaLiteral(address.tab)}, ${toLuaLiteral(address.path)}, ${v})`,
      );
      if (!r.ok || r.aura === undefined) throw new OptionEditError(r.error ?? "The edit failed");
      const edit: OptionEdit = {
        aura: toAura(r.aura),
        changed: r.changed === true,
        ...(r.children && { children: r.children.map(toAura) }),
        ...(r.warning && { warning: r.warning }),
        ...(r.dialog && { dialog: r.dialog }),
      };
      if (edit.changed) loadedKey = JSON.stringify({ aura: edit.aura, children: edit.children ?? state.children.map(toAura) });
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
      packsCache ??= json<AuraPacks>("__options.packs()");
      return packsCache;
    },
    setSpells(spells) {
      if (Object.keys(spells).length > 0) lua.doStringSync(spellsToLua(spells));
    },
    registries() {
      registriesCache ??= json<Registries>("__extract.registries()");
      return registriesCache;
    },
    optionReference(options) {
      const keepSections = <T>(fn: () => T): T => {
        lua.doStringSync("__options.saveCollapsed()");
        try {
          return fn();
        } finally {
          lua.doStringSync("__options.restoreCollapsed()");
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
