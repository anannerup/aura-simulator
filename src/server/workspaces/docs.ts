import { DEFAULT_ADDON_REF, sampleIconAura } from "@/core";
import { agentDocsMarkdown } from "@/docs/agent-docs";
import { getServerAuraCore } from "./aura-core";

/** The agent docs for an origin, with the sample encoded by the real addon (still served if it can't load). */
export async function loadAgentDocs(origin: string): Promise<string> {
  try {
    const core = await getServerAuraCore();
    const sampleAura = sampleIconAura(core.internalVersion);
    return agentDocsMarkdown({
      origin,
      addonRef: core.ref,
      addonVersion: core.addonVersion,
      internalVersion: core.internalVersion,
      sampleAura,
      sampleCode: core.encode({ aura: sampleAura, children: [] }),
    });
  } catch {
    return agentDocsMarkdown({
      origin,
      addonRef: DEFAULT_ADDON_REF,
      addonVersion: null,
      internalVersion: null,
      sampleAura: sampleIconAura(92),
      sampleCode: null,
    });
  }
}
