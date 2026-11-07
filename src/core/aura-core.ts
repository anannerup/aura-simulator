import { Lua } from "wasmoon-lua5.1";
import { ADDON_FILES, DEFAULT_ADDON_REF, jsDelivrFetcher, normalizeNewlines, type AddonSourceFetcher } from "./addon-source";
import { AURA_CORE, LOAD_LIBRARY, LOAD_TRANSMISSION } from "./lua-glue";
import { LUA_STDLIB } from "./lua-stdlib";
import { canonicalize, isLuaTable, toLuaLiteral, type AuraDocument, type AuraState, type LuaObject, type LuaValue } from "./lua-value";
import { loadInlineAddonVM, loadWorkerAddonVM, type AddonVMMethod, type AsyncAddonVM } from "./addon-vm/remote";
import type { AddonVM, AddonVMReport, Registries } from "./addon-vm/vm";
import type { ValidationResult } from "./addon-vm/validation";
import type { AuraPacks, NewAuraPage, OptionAddress, OptionEdit, OptionsTree } from "./addon-vm/options";
import { createSpellPreloader, type SpellInfoSource } from "./addon-vm/spells";

export type { AuraDocument, AuraState };

export interface DecodedState extends AuraState {
  /** `s` of the transmit table: the addon version string of whoever made the code. */
  senderVersion?: string;
  /** `v` of the transmit table: 1421, or 2000 when the code holds nested groups. */
  transmissionVersion?: number;
}

export interface AuraCore {
  /** The addon ref this core was loaded from (release tag, branch or commit). */
  readonly ref: string;
  /** WeakAuras.versionString of that addon version, e.g. "5.22.0"; written as `s` into every state code. */
  readonly addonVersion: string;
  /** WeakAuras.InternalVersion() of that addon version, e.g. 92. */
  readonly internalVersion: number;
  /** Encodes an aura (and its group descendants) to a plain `!WA:2!` state code. */
  encode(state: AuraState): string;
  /** Decodes a state code with the addon's own import decoder. Throws on anything that isn't an aura. */
  decode(code: string): DecodedState;

  // The calls below run the whole addon (WeakAuras + WeakAurasOptions) in a second, full Lua VM,
  // loaded on first use (a few hundred ms; in a Web Worker in the browser). encode/decode never wait for it.

  /**
   * Fills defaults and migrates with the addon's own WeakAuras.PreAdd (Modernize, Display.Migrate,
   * region, sub-region and data_stub defaults). Returns the canonical documents. An aura without
   * `internalVersion` is taken to be written for this addon version.
   */
  fillDefaults(state: AuraState): Promise<AuraState>;
  /**
   * The addon's own validation and combat rules, in plain words, with a pointer to the option that
   * causes each problem. Never throws for a bad aura: problems are in the result.
   */
  validate(state: AuraState): Promise<ValidationResult>;
  /** Region/sub-region defaults and properties, trigger prototypes, Aura (Modern) registries (cached). */
  registries(): Promise<Registries>;
  /** Loads the full addon VM now instead of on first use. Resolves with its load report (timings). */
  loadFullAddon(): Promise<AddonVMReport>;
  /**
   * The in-game options window for `state.aura`: its tabs (same order and names as the game) and
   * the requested tab's option tree (default: the first tab), built by WeakAurasOptions' own
   * option generators and evaluated for this aura: names, values, ranges, hidden, disabled and
   * each option's current value. Collapsible sections start the way the game starts them.
   */
  options(state: AuraState, request?: { tab?: string }): Promise<OptionsTree>;
  /**
   * Changes one option through its own set() (an execute option: runs its func(), e.g. "Add
   * Condition", "Delete", expanding a section). Returns the aura as given plus what the edit
   * changed. Throws OptionEditError when the addon refuses the value or the option can't run here.
   */
  setOption(state: AuraState, address: OptionAddress, value?: unknown): Promise<OptionEdit>;
  /** What the window's New Aura page offers: display types (names, descriptions), Modern Aura Group, Packs, Premade. */
  newAuraPage(): Promise<NewAuraPage>;
  /**
   * A new aura of a display type as the game makes it (WeakAuras.NewAura: data stub, region defaults, default sub
   * elements, an Aura (Modern) trigger where the type supports it). The id is the addon's ("New"); callers rename it.
   */
  newAura(regionType: string, sourceData?: LuaObject): Promise<AuraDocument>;
  /** The window's Packs page: utility packs and each class's HUD pack with its blocks, with their import data. */
  packs(): Promise<AuraPacks>;
  /** Frees both Lua VMs (terminates the full VM's worker). The core can't be used afterwards. */
  dispose(): void;
}

type StateMethod = "fillDefaults" | "validate" | "options" | "setOption";
type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never;

export interface LoadAddonOptions {
  /** Where source files come from. Default: jsDelivr for `ref`. */
  fetchSource?: AddonSourceFetcher;
  /** Location of liblua5.1.wasm. Default: wasmoon's own (the page passes its own `/lua/liblua5.1.wasm` route). */
  wasmUri?: string;
  /** Where the full addon VM runs. Default: "worker" where Web Workers exist (browser), else "inline". */
  fullAddon?: "worker" | "inline";
  /**
   * What the game client knows about spells (name, icon), for C_Spell.GetSpellInfo and friends in the
   * full addon VM: the options editor's "1459 (Arcane Intellect)" and validation. Asked for the spell IDs
   * an aura refers to before each full-VM call. Without it every spell is unknown (nil).
   */
  spellInfo?: SpellInfoSource;
}

const STATE_CODE_PREFIX = "!WA:2!";

function readVersionString(init: string): string {
  const m = /^local versionString = "([^"]+)"/m.exec(init);
  if (!m) throw new Error("Init.lua no longer defines versionString; the aura core needs updating");
  return m[1];
}

function readInternalVersion(weakAuras: string): number {
  const m = /^local internalVersion = (\d+)/m.exec(weakAuras);
  if (!m) throw new Error("WeakAuras.lua no longer defines internalVersion; the aura core needs updating");
  return Number(m[1]);
}

/** Loads an addon version's Lua and returns an aura core bound to it. */
export async function loadAddon(ref: string = DEFAULT_ADDON_REF, options: LoadAddonOptions = {}): Promise<AuraCore> {
  const fetchSource = options.fetchSource ?? jsDelivrFetcher(ref);
  const names = Object.keys(ADDON_FILES) as (keyof typeof ADDON_FILES)[];
  const texts = await Promise.all(names.map((n) => fetchSource(ADDON_FILES[n])));
  const src = Object.fromEntries(names.map((n, i) => [n, normalizeNewlines(texts[i])])) as Record<
    keyof typeof ADDON_FILES,
    string
  >;

  const addonVersion = readVersionString(src.init);
  const internalVersion = readInternalVersion(src.weakAuras);

  const lua = await Lua.create(options.wasmUri ? { customWasmUri: options.wasmUri } : {});
  lua.doStringSync(LUA_STDLIB);
  for (const name of ["libStub", "libDeflate", "libSerialize"] as const) {
    lua.global.set("__src", src[name]);
    lua.global.set("__name", ADDON_FILES[name]);
    lua.doStringSync(LOAD_LIBRARY);
  }
  lua.global.set("__src", src.transmission);
  lua.global.set("__name", ADDON_FILES.transmission);
  lua.global.set("__versionString", addonVersion);
  lua.doStringSync(LOAD_TRANSMISSION);
  lua.doStringSync(AURA_CORE);

  const fullAddonMode = options.fullAddon ?? (typeof window !== "undefined" && typeof Worker !== "undefined" ? "worker" : "inline");
  let fullVM: Promise<AsyncAddonVM> | undefined;
  let disposed = false;
  const full = () => {
    if (disposed) return Promise.reject(new Error("This aura core was disposed"));
    if (!fullVM) {
      const loading = (fullAddonMode === "worker" ? loadWorkerAddonVM : loadInlineAddonVM)(ref, { fetchSource, wasmUri: options.wasmUri });
      // A failed load is retried on the next call.
      loading.catch(() => {
        if (fullVM === loading) fullVM = undefined;
      });
      fullVM = loading;
    }
    return fullVM;
  };
  const spells = createSpellPreloader(options.spellInfo);
  /** The full VM, with the spells `state` refers to loaded into it. */
  const fullFor = async (state: AuraState) => {
    const auras = [state.aura, ...state.children];
    const [vm] = await Promise.all([full(), spells.fetch(auras)]);
    await vm.setSpells(spells.take(vm, auras));
    return vm;
  };

  /** A full-VM call on `state`, with the spells it refers to loaded first. */
  const onState =
    <K extends StateMethod>(method: K) =>
    async (state: AuraState, ...rest: Tail<Parameters<AddonVM[K]>>) =>
      ((await fullFor(state))[method] as (...args: unknown[]) => Promise<ReturnType<AddonVM[K]>>)(state, ...rest);
  const onVM =
    <K extends AddonVMMethod>(method: K) =>
    async (...args: Parameters<AddonVM[K]>) =>
      ((await full())[method] as (...args: unknown[]) => Promise<ReturnType<AddonVM[K]>>)(...args);

  return {
    ref,
    addonVersion,
    internalVersion,
    fillDefaults: onState("fillDefaults"),
    validate: onState("validate"),
    options: onState("options"),
    setOption: onState("setOption"),
    registries: onVM("registries"),
    newAuraPage: onVM("newAuraPage"),
    newAura: onVM("newAura"),
    packs: onVM("packs"),

    async loadFullAddon() {
      return (await full()).report;
    },

    dispose() {
      disposed = true;
      lua.global.close();
      fullVM?.then((vm) => vm.dispose(), () => {});
      fullVM = undefined;
    },

    encode(state) {
      const aura = canonicalize(state.aura);
      if (!isLuaTable(aura) || Array.isArray(aura)) throw new Error("An aura must be a table with string keys");
      const children = state.children.map((c) => canonicalize(c));
      const hasSubGroups = children.some((c) => isLuaTable(c) && !Array.isArray(c) && "controlledChildren" in c);
      // Same transmit table as Private.DisplayToString in Transmission.lua.
      const transmit: LuaObject = {
        m: "d",
        d: aura,
        v: hasSubGroups ? 2000 : 1421,
        s: addonVersion,
      };
      if (children.length > 0) transmit.c = children;
      const code: unknown = lua.doStringSync(`return AuraCore.encode(${toLuaLiteral(transmit)})`);
      if (typeof code !== "string" || !code.startsWith(STATE_CODE_PREFIX)) throw new Error("Encoding failed");
      return code;
    },

    decode(code) {
      const trimmed = code.trim();
      if (!trimmed.startsWith(STATE_CODE_PREFIX)) throw new Error(`A state code starts with ${STATE_CODE_PREFIX}`);
      const result: unknown = lua.doStringSync(`return AuraCore.decode(${toLuaLiteral(trimmed)})`);
      if (typeof result !== "string") throw new Error("Decoding failed");
      if (result.startsWith("E")) throw new Error(result.slice(1));
      const received = JSON.parse(result.slice(1)) as LuaValue;
      if (!isLuaTable(received) || Array.isArray(received) || received.m !== "d") {
        throw new Error("This state code doesn't hold an aura");
      }
      const aura = received.d;
      if (!isLuaTable(aura) || Array.isArray(aura)) throw new Error("This state code doesn't hold an aura");
      const c = received.c;
      const children = isLuaTable(c) ? (Array.isArray(c) ? c : Object.values(c)) : [];
      return {
        aura,
        children: children.filter((x): x is AuraDocument => isLuaTable(x) && !Array.isArray(x)),
        senderVersion: typeof received.s === "string" ? received.s : undefined,
        transmissionVersion: typeof received.v === "number" ? received.v : undefined,
      };
    },
  };
}
