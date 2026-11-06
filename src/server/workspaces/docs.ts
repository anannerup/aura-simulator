import { DEFAULT_ADDON_REF } from "@/core";
import { collectAddonFacts, type AddonFacts } from "@/docs/addon-facts";
import { agentDocsMarkdown } from "@/docs/agent-docs";
import { getServerAuraCore } from "./aura-core";

const g = globalThis as typeof globalThis & { __agentDocFacts?: Map<string, Promise<AddonFacts>> };

/** The addon facts for the server's addon version, read once per process (a failed read is retried). */
function addonFacts(): Promise<AddonFacts> {
  const cache = (g.__agentDocFacts ??= new Map());
  let facts = cache.get(DEFAULT_ADDON_REF);
  if (!facts) {
    facts = getServerAuraCore(DEFAULT_ADDON_REF).then(collectAddonFacts);
    facts.catch(() => cache.delete(DEFAULT_ADDON_REF));
    cache.set(DEFAULT_ADDON_REF, facts);
  }
  return facts;
}

/** The agent docs for an origin, generated from the addon version (still served if it can't load). */
export async function loadAgentDocs(origin: string): Promise<string> {
  let addon: AddonFacts | null = null;
  try {
    addon = await addonFacts();
  } catch {
    addon = null;
  }
  return agentDocsMarkdown({ origin, addonRef: DEFAULT_ADDON_REF, addon });
}
