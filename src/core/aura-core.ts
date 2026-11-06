import { Lua } from "wasmoon-lua5.1";
import { ADDON_FILES, DEFAULT_ADDON_REF, jsDelivrFetcher, type AddonSourceFetcher } from "./addon-source";
import { AURA_CORE, LOAD_LIBRARY, LOAD_TRANSMISSION, WOW_SHIM } from "./lua-glue";
import { canonicalize, isLuaTable, toLuaLiteral, type LuaObject, type LuaValue } from "./lua-value";

/** One aura's table, as the addon stores it (see lua-value.ts for the JS representation). */
export type AuraDocument = LuaObject;

/** What a state code holds: an aura (or group) and, for groups, all its descendants. */
export interface AuraState {
  aura: AuraDocument;
  /** Every descendant of a group, flattened in the addon's traversal order. Empty for a single aura. */
  children: AuraDocument[];
}

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
}

export interface LoadAddonOptions {
  /** Where source files come from. Default: jsDelivr for `ref`. */
  fetchSource?: AddonSourceFetcher;
  /** Location of liblua5.1.wasm. Default: wasmoon's own (unpkg in the browser, the package in Node). */
  wasmUri?: string;
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

const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, "\n");

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
  lua.doStringSync(WOW_SHIM);
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

  return {
    ref,
    addonVersion,
    internalVersion,

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
