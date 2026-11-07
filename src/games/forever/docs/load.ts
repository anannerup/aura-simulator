import { getServerAuraCore, resolveServerRef } from "@/server/addon/core";
import type { ServerGame } from "@/server/game";
import { collectAddonFacts, type AddonFacts } from "./addon-facts";
import { agentDocsMarkdown } from "./agent-docs";

const g = globalThis as typeof globalThis & { __foreverDocFacts?: Map<string, Promise<AddonFacts>> };

/** The addon facts of a resolved ref, read once per process (a failed read is retried). */
function addonFacts(server: ServerGame, ref: string): Promise<AddonFacts> {
  const cache = (g.__foreverDocFacts ??= new Map());
  let facts = cache.get(ref);
  if (!facts) {
    facts = getServerAuraCore(server, ref).then(collectAddonFacts);
    facts.catch(() => cache.delete(ref));
    cache.set(ref, facts);
  }
  return facts;
}

/**
 * Forever's agent docs for an origin, generated from the requested addon version (default: the server's, see
 * resolveServerRef). Still served, without the generated lists, if that version can't be loaded.
 */
export async function loadAgentDocs(server: ServerGame, origin: string, requestedRef?: string | null): Promise<string> {
  let addonRef = requestedRef?.trim() || server.game.addon.fallbackRef;
  let addon: AddonFacts | null = null;
  try {
    const resolution = await resolveServerRef(server, requestedRef);
    addonRef = resolution.ref;
    addon = await addonFacts(server, resolution.ref);
  } catch {
    addon = null;
  }
  return agentDocsMarkdown({ origin, addonRef, addon });
}
