import { Lua } from "wasmoon-lua5.1";
import type { AddonSourceFetcher } from "../addon-source";
import { AURA_CORE } from "../lua-glue";
import { canonicalize, isLuaTable, toLuaLiteral, type LuaObject, type LuaValue } from "../lua-value";
import { ADDON_CONTRACT, AddonContractError } from "./contract";
import { BRIDGE_LUA } from "./lua/bridge";
import { EXTRACT_LUA } from "./lua/extract";
import { SHIM_LUA } from "./lua/shim";
import { PROFILE_LUA } from "./profile";
import { addonLoadOrder } from "./toc";
import { interpretValidation, mergeValidation, type RawValidation, type ValidationResult } from "./validation";

/** An aura and its group descendants (same shape as AuraState in aura-core.ts). */
export interface VMState {
  aura: LuaObject;
  children: LuaObject[];
}

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
  fillDefaults(state: VMState): VMState;
  validate(state: VMState): ValidationResult;
  registries(): Registries;
}

export interface LoadAddonVMOptions {
  fetchSource: AddonSourceFetcher;
  wasmUri?: string;
}

const ADDONS = ["WeakAuras", "WeakAurasOptions"] as const;
const PROBE_NAMESPACES = /^(C_Secrets|C_CurveUtil|C_StringUtil|C_DurationUtil|C_NamePlate|C_UnitAuras|AuraUtil|Enum)\./;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, "\n");

/**
 * Loads WeakAuras and WeakAurasOptions of one addon version into a fresh Lua VM, with the WoW API
 * shim and the Forever client profile, runs login, and checks the addon contract.
 */
export async function loadAddonVM(ref: string, options: LoadAddonVMOptions): Promise<AddonVM> {
  const t0 = now();
  const { fetchSource } = options;
  const plans = await Promise.all(
    ADDONS.map(async (addon) => {
      const { toc, files } = await addonLoadOrder(fetchSource, addon);
      const sources = await Promise.all(files.map(async (f) => normalizeNewlines(await fetchSource(`${addon}/${f}`))));
      return { addon, toc, files, sources };
    }),
  );
  const tFetched = now();

  const lua = await Lua.create(options.wasmUri ? { customWasmUri: options.wasmUri } : {});
  const tVm = now();
  lua.doStringSync(SHIM_LUA);
  lua.doStringSync(BRIDGE_LUA);
  lua.doStringSync(PROFILE_LUA);

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
  lua.doStringSync(EXTRACT_LUA);
  // What WeakAuras.ToggleOptions does the first time, minus opening the window.
  lua.doStringSync("if __shim.private.WeakAurasOptions then __shim.private.WeakAurasOptions.Private = __shim.private.WeakAuras end");

  const missing = json<string[]>(`__extract.checkContract(${toLuaLiteral(ADDON_CONTRACT as unknown as LuaValue)})`);
  if (Array.isArray(missing) && missing.length > 0) {
    lua.global.close();
    throw new AddonContractError(ref, missing);
  }
  if (!loginFinished) throw new Error(`Musca Auras ${ref} did not finish logging in inside the simulated client`);
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

  const toAura = (doc: unknown): LuaObject => {
    const c = canonicalize(doc as LuaValue);
    if (!isLuaTable(c) || Array.isArray(c)) throw new Error("An aura must be a table with string keys");
    return c;
  };
  const fill = (aura: LuaObject): LuaObject => {
    const out = lua.doStringSync(
      `return AuraCore.toJSON((__extract.prepare(${toLuaLiteral(toAura(aura))})))`,
    ) as string;
    return JSON.parse(out) as LuaObject;
  };
  const validateOne = (aura: LuaObject): RawValidation => json<RawValidation>(`__extract.validate(${toLuaLiteral(toAura(aura))})`);
  let registriesCache: Registries | undefined;

  return {
    ref,
    report,
    fillDefaults(state) {
      return { aura: fill(state.aura), children: state.children.map(fill) };
    },
    validate(state) {
      const auras = [state.aura, ...state.children];
      const ids = auras.map((aura) => (typeof aura.id === "string" ? aura.id : undefined));
      const isGroup = state.children.length > 0;
      const results = auras.map((aura, i) => interpretValidation(validateOne(aura), isGroup ? ids[i] : undefined));
      return mergeValidation(results, ids);
    },
    registries() {
      registriesCache ??= json<Registries>("__extract.registries()");
      return registriesCache;
    },
  };
}
