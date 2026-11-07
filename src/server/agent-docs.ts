import { DEFAULT_ADDON_REF } from "@/core";
import { collectAddonFacts, type AddonFacts } from "@/docs/addon-facts";
import { agentDocsMarkdown } from "@/docs/agent-docs";
import { getServerAuraCore, resolveServerRef } from "@/server/addon/core";

const g = globalThis as typeof globalThis & { __agentDocFacts?: Map<string, Promise<AddonFacts>> };

/** The addon facts of a resolved ref, read once per process (a failed read is retried). */
function addonFacts(ref: string): Promise<AddonFacts> {
  const cache = (g.__agentDocFacts ??= new Map());
  let facts = cache.get(ref);
  if (!facts) {
    facts = getServerAuraCore(ref).then(collectAddonFacts);
    facts.catch(() => cache.delete(ref));
    cache.set(ref, facts);
  }
  return facts;
}

/**
 * The agent docs for an origin, generated from the requested addon version (default: the server's, see
 * resolveServerRef). Still served, without the generated lists, if that version can't be loaded.
 */
export async function loadAgentDocs(origin: string, requestedRef?: string | null): Promise<string> {
  let addonRef = requestedRef?.trim() || DEFAULT_ADDON_REF;
  let addon: AddonFacts | null = null;
  try {
    const resolution = await resolveServerRef(requestedRef);
    addonRef = resolution.ref;
    addon = await addonFacts(resolution.ref);
  } catch {
    addon = null;
  }
  return agentDocsMarkdown({ origin, addonRef, addon });
}
