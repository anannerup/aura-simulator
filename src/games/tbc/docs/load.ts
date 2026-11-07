import { getServerAuraCore, resolveServerRef } from "@/server/addon/core";
import type { ServerGame } from "@/server/game";
import { collectTbcAddonFacts, type TbcAddonFacts } from "./addon-facts";
import { tbcAgentDocsMarkdown } from "./agent-docs";

const g = globalThis as typeof globalThis & { __tbcDocFacts?: Map<string, Promise<TbcAddonFacts>> };

/** The addon facts of a resolved release, read once per process (a failed read is retried). */
function addonFacts(server: ServerGame, ref: string): Promise<TbcAddonFacts> {
  const cache = (g.__tbcDocFacts ??= new Map());
  let facts = cache.get(ref);
  if (!facts) {
    facts = getServerAuraCore(server, ref).then(collectTbcAddonFacts);
    facts.catch(() => cache.delete(ref));
    cache.set(ref, facts);
  }
  return facts;
}

/**
 * TBC's agent docs for an origin, generated from the requested WeakAuras2 release (default: the newest). Still served,
 * without the generated lists, if that release can't be loaded.
 */
export async function loadTbcAgentDocs(server: ServerGame, origin: string, requestedRef?: string | null): Promise<string> {
  let addonRef = requestedRef?.trim() || server.game.addon.fallbackRef;
  let addon: TbcAddonFacts | null = null;
  try {
    const resolution = await resolveServerRef(server, requestedRef);
    addonRef = resolution.ref;
    addon = await addonFacts(server, resolution.ref);
  } catch {
    addon = null;
  }
  return tbcAgentDocsMarkdown({ origin, addonRef, addon });
}
