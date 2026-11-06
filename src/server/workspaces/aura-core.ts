import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_ADDON_REF, jsDelivrFetcher, loadAddon, type AddonSourceFetcher, type AuraCore } from "@/core";

/**
 * The aura core in Node, for the push API and the agent docs.
 * Addon files come from jsDelivr once and are kept under `.cache/addon/<ref>/` (gitignored, the same
 * layout the core tests use). Ticket 04's addon cache can replace this fetcher.
 */
function diskCachedFetcher(ref: string): AddonSourceFetcher {
  const remote = jsDelivrFetcher(ref);
  const safeRef = ref.replace(/[^A-Za-z0-9._-]/g, "_");
  const root = path.join(process.cwd(), ".cache", "addon", safeRef);
  return async (file) => {
    const local = path.join(root, file);
    try {
      return await readFile(local, "utf8");
    } catch {
      const text = await remote(file);
      await mkdir(path.dirname(local), { recursive: true });
      await writeFile(local, text);
      return text;
    }
  };
}

const globalForCore = globalThis as typeof globalThis & { __serverAuraCores?: Map<string, Promise<AuraCore>> };

/** The shared server-side aura core for an addon ref (loaded once per process; a failed load is retried). */
export function getServerAuraCore(ref: string = DEFAULT_ADDON_REF): Promise<AuraCore> {
  const cores = (globalForCore.__serverAuraCores ??= new Map());
  let core = cores.get(ref);
  if (!core) {
    core = loadAddon(ref, {
      fetchSource: diskCachedFetcher(ref),
      wasmUri: path.join(process.cwd(), "node_modules/wasmoon-lua5.1/dist/liblua5.1.wasm"),
    });
    core.catch(() => cores.delete(ref));
    cores.set(ref, core);
  }
  return core;
}
