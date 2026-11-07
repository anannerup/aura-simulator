import path from "node:path";
import { loadAddon, type AuraCore } from "@/core";
import type { ServerGame } from "@/server/game";
import { clientSpells } from "./client-spells";
import type { Resolution } from "./source-cache";

/** wasmoon's Lua 5.1 binary in the installed package (the server's cores load it; the page gets it from /lua/liblua5.1.wasm). */
export const LUA_WASM_PATH = path.join(process.cwd(), "node_modules/wasmoon-lua5.1/dist/liblua5.1.wasm");

/**
 * The addon version a server answer uses: the one asked for, else the newest release (what the page picks by
 * default), else the game's fallback release when the version list can't be read.
 */
export async function resolveServerRef(server: ServerGame, requested?: string | null): Promise<Resolution> {
  const cache = server.addon;
  const ref = requested?.trim() || (await cache.versions().catch(() => null))?.defaultRef || server.game.addon.fallbackRef;
  return cache.resolve(ref);
}

const globalForCore = globalThis as typeof globalThis & { __serverAuraCores?: Map<string, Promise<AuraCore>> };

/**
 * The aura core in Node (push API, agent docs, version diff) for a game's addon version, with its files from the
 * game's addon source cache. One per game, resolved release and process; a failed load is retried.
 */
export async function getServerAuraCore(server: ServerGame, requested?: string | null): Promise<AuraCore> {
  const { ref } = await resolveServerRef(server, requested);
  const cores = (globalForCore.__serverAuraCores ??= new Map());
  const key = `${server.game.id}\n${ref}`;
  let core = cores.get(key);
  if (!core) {
    core = loadAddon(ref, {
      game: server.game.id,
      fetchSource: (file) => server.addon.readText(ref, file),
      wasmUri: LUA_WASM_PATH,
      spellInfo: (ids) => clientSpells(server.spells, ids),
    });
    core.catch(() => cores.delete(key));
    cores.set(key, core);
  }
  return core;
}
