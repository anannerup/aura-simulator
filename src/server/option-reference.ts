/**
 * The option ↔ table reference on the server, per game and addon version. Generating one takes about two minutes
 * (in the background, sharing the server's thread: about four), so each is cached in memory and on disk in the game's addon
 * source cache, next to the version's files (`option-reference-v<format>.json`: a new format is generated again).
 */
import { OPTION_REFERENCE_FORMAT, type OptionReference } from "@/core";
import { getServerAuraCore, resolveServerRef } from "./addon/core";
import type { ServerGame } from "./game";

interface Job {
  promise: Promise<OptionReference>;
  /** Set once it is ready. */
  value?: OptionReference;
}

const g = globalThis as typeof globalThis & { __optionReferences?: Map<string, Job>; __optionReferenceQueue?: Promise<unknown> };

/** Generations run one at a time (each already takes half the server's thread). */
function queued<T>(work: () => Promise<T>): Promise<T> {
  const run = (g.__optionReferenceQueue ?? Promise.resolve()).then(work, work);
  g.__optionReferenceQueue = run.catch(() => {});
  return run;
}

async function job(server: ServerGame, requestedRef?: string | null): Promise<Job> {
  const resolution = await resolveServerRef(server, requestedRef);
  const jobs = (g.__optionReferences ??= new Map());
  const key = `${server.game.id}\n${resolution.key}`;
  let found = jobs.get(key);
  if (!found) {
    const promise = server.addon.memo(resolution, `option-reference-v${OPTION_REFERENCE_FORMAT}`, () =>
      queued(async () => (await getServerAuraCore(server, resolution.ref)).optionReference({ background: true })),
    );
    const started: Job = { promise };
    promise.then(
      (value) => (started.value = value),
      () => jobs.delete(key), // retried on the next request
    );
    jobs.set(key, started);
    found = started;
  }
  return found;
}

/** A game's reference for an addon version (default: the newest); the first request for a version waits for it. */
export async function loadOptionReference(server: ServerGame, requestedRef?: string | null): Promise<OptionReference> {
  return (await job(server, requestedRef)).promise;
}

/**
 * The reference if it is ready (or cached on disk, read within a moment); else null, and generation has started.
 * For the docs section, which shouldn't wait a minute.
 */
export async function readyOptionReference(server: ServerGame, requestedRef?: string | null): Promise<OptionReference | null> {
  const j = await job(server, requestedRef);
  if (j.value) return j.value;
  const soon = new Promise<null>((resolve) => setTimeout(() => resolve(null), 300));
  return Promise.race([j.promise.catch(() => null), soon]);
}
