import path from "node:path";
import { DEFAULT_ADDON_REF, loadAddon, type AuraCore } from "@/core";
import { getSpellCache } from "@/server/spells";
import { clientSpells } from "./client-spells";
import { getAddonSourceCache, type Resolution } from "./source-cache";

/** wasmoon's Lua 5.1 binary in the installed package (the server's cores load it; the page gets it from /lua/liblua5.1.wasm). */
export const LUA_WASM_PATH = path.join(process.cwd(), "node_modules/wasmoon-lua5.1/dist/liblua5.1.wasm");

/**
 * The addon version a server answer uses: the one asked for, else the newest release (what the page picks by
 * default), else DEFAULT_ADDON_REF when the version list can't be read.
 */
export async function resolveServerRef(requested?: string | null): Promise<Resolution> {
  const cache = getAddonSourceCache();
  const ref = requested?.trim() || (await cache.versions().catch(() => null))?.defaultRef || DEFAULT_ADDON_REF;
  return cache.resolve(ref);
}

const globalForCore = globalThis as typeof globalThis & { __serverAuraCores?: Map<string, Promise<AuraCore>> };

/**
 * The aura core in Node (push API, agent docs, version diff) for an addon ref, with its files from the addon
 * source cache. One per resolved ref and process; a failed load is retried.
 */
export async function getServerAuraCore(requested?: string | null): Promise<AuraCore> {
  const { ref } = await resolveServerRef(requested);
  const cores = (globalForCore.__serverAuraCores ??= new Map());
  let core = cores.get(ref);
  if (!core) {
    const cache = getAddonSourceCache();
    core = loadAddon(ref, {
      fetchSource: (file) => cache.readText(ref, file),
      wasmUri: LUA_WASM_PATH,
      spellInfo: (ids) => clientSpells(getSpellCache(), ids),
    });
    core.catch(() => cores.delete(ref));
    cores.set(ref, core);
  }
  return core;
}
