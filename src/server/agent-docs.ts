import { DEFAULT_ADDON_REF, OPTION_REFERENCE_FORMAT, type OptionReference } from "@/core";
import { collectAddonFacts, type AddonFacts } from "@/docs/addon-facts";
import { agentDocsMarkdown } from "@/docs/agent-docs";
import { getServerAuraCore, resolveServerRef } from "@/server/addon/core";
import { getAddonSourceCache } from "@/server/addon/source-cache";

const g = globalThis as typeof globalThis & {
  __agentDocFacts?: Map<string, Promise<AddonFacts>>;
  __optionReferences?: Map<string, { promise: Promise<OptionReference>; value?: OptionReference }>;
};

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
 * The option ↔ table reference of an addon version (default: the server's). Generating it takes about a minute,
 * so it is cached per resolved ref: in memory, and on disk next to the version's addon files (kept across restarts;
 * the file name carries the reference's format, so a new format is generated again). A failed generation is retried.
 */
export async function loadOptionReference(requestedRef?: string | null): Promise<OptionReference> {
  return (await optionReferenceJob(requestedRef)).promise;
}

async function optionReferenceJob(requestedRef?: string | null) {
  const resolution = await resolveServerRef(requestedRef);
  const jobs = (g.__optionReferences ??= new Map());
  let job = jobs.get(resolution.key);
  if (!job) {
    const promise = getAddonSourceCache().memo(resolution, `option-reference-v${OPTION_REFERENCE_FORMAT}`, async () =>
      (await getServerAuraCore(resolution.ref)).optionReference({ background: true }),
    );
    const started: { promise: Promise<OptionReference>; value?: OptionReference } = { promise };
    promise.then(
      (value) => (started.value = value),
      () => jobs.delete(resolution.key),
    );
    jobs.set(resolution.key, started);
    job = started;
  }
  return job;
}

/**
 * The agent docs for an origin, generated from the requested addon version (default: the server's, see
 * resolveServerRef). Still served, without the generated lists, if that version can't be loaded. The option ↔ table
 * reference section is filled once the reference is ready (asking for the docs starts generating it).
 */
export async function loadAgentDocs(origin: string, requestedRef?: string | null): Promise<string> {
  let addonRef = requestedRef?.trim() || DEFAULT_ADDON_REF;
  let addon: AddonFacts | null = null;
  let optionReference: OptionReference | null = null;
  try {
    const resolution = await resolveServerRef(requestedRef);
    addonRef = resolution.ref;
    addon = await addonFacts(resolution.ref);
    const job = await optionReferenceJob(resolution.ref);
    job.promise.catch(() => {});
    // A reference cached on disk is read in a moment; one still being generated is left for a later reload.
    optionReference = job.value ?? (await Promise.race([job.promise.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 300))]));
  } catch {
    addon ??= null;
  }
  return agentDocsMarkdown({ origin, addonRef, addon, optionReference });
}
