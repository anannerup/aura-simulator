/**
 * The pushes recently sent to each workspace ID, and the pages listening. Held in memory only (the browser keeps the
 * workspace; the server only keeps recent pushes), capped by workspace count and total size so a public deployment
 * can't grow it without bound.
 *
 * Listeners get a notice (revision, time, source), never the code: codes can be megabytes, and a page fetches the
 * revision it needs. The last few revisions per workspace are kept so a page can fetch each in turn.
 */
import type { Situation } from "@/core";
import type { WorkspaceNotice, WorkspaceSnapshot } from "@/workspace";

export type WorkspaceListener = (notice: WorkspaceNotice) => void;
export type SituationListener = (situation: Situation) => void;

export interface WorkspaceHub {
  /** The latest snapshot, or (with `revision`) that recent revision; null when it is no longer kept. */
  get(id: string): WorkspaceSnapshot;
  get(id: string, revision: number): WorkspaceSnapshot | null;
  /** Records a push and tells every listener. */
  set(id: string, code: string, source?: string | null): WorkspaceSnapshot;
  /** Returns an unsubscribe function. */
  subscribe(id: string, listener: WorkspaceListener): () => void;
  /** The situation an agent last set for the workspace (null: none, the page's own stands). */
  getSituation(id: string): Situation | null;
  /** Records the workspace's situation and tells every situation listener. */
  setSituation(id: string, situation: Situation): void;
  /** Returns an unsubscribe function. */
  subscribeSituation(id: string, listener: SituationListener): () => void;
  /**
   * Forgets the workspace: its pushes and its situation (open pages keep their own copy, in the browser). False when
   * nothing was kept for it.
   */
  delete(id: string): boolean;
}

export interface HubLimits {
  maxWorkspaces?: number;
  /** Revisions kept per workspace. */
  revisionsKept?: number;
  /** Total characters of codes kept across all workspaces. */
  maxTotalChars?: number;
}

interface Entry {
  code: string;
  updatedAt: string;
  revision: number;
  source: string | null;
}

export const notice = ({ id, updatedAt, revision, source }: WorkspaceSnapshot): WorkspaceNotice => ({ id, updatedAt, revision, source });

export function createWorkspaceHub(limits: HubLimits = {}): WorkspaceHub {
  const maxWorkspaces = limits.maxWorkspaces ?? 1000;
  const revisionsKept = limits.revisionsKept ?? 8;
  const maxTotalChars = limits.maxTotalChars ?? 256 * 1024 * 1024;
  /** Per workspace, oldest revision first. Map order: least recently changed workspace first. */
  const states = new Map<string, Entry[]>();
  const listeners = new Map<string, Set<WorkspaceListener>>();
  /** Per workspace, least recently set first; small, capped by workspace count. */
  const situations = new Map<string, Situation>();
  const situationListeners = new Map<string, Set<SituationListener>>();
  let totalChars = 0;

  const listen = <L>(all: Map<string, Set<L>>, id: string, listener: L) => {
    let set = all.get(id);
    if (!set) all.set(id, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) all.delete(id);
    };
  };
  const tell = <T>(all: Set<(value: T) => void> | undefined, value: T) => {
    for (const listener of all ?? []) {
      try {
        listener(value);
      } catch {
        // A broken listener (closed stream) must not stop the others.
      }
    }
  };

  const toSnapshot = (id: string, e: Entry | undefined): WorkspaceSnapshot => ({
    id,
    code: e?.code ?? null,
    updatedAt: e?.updatedAt ?? null,
    revision: e?.revision ?? 0,
    source: e?.source ?? null,
  });

  /**
   * Drops what is over the limits, least recently changed workspace first: its old revisions, then the workspace.
   * The workspace just changed (`keep`) only loses old revisions.
   */
  const evict = (keep: string) => {
    for (const [id, entries] of states) {
      if (states.size <= maxWorkspaces && totalChars <= maxTotalChars) return;
      while (entries.length > 1 && totalChars > maxTotalChars) totalChars -= entries.shift()!.code.length;
      if (id === keep || (states.size <= maxWorkspaces && totalChars <= maxTotalChars)) continue;
      for (const e of entries) totalChars -= e.code.length;
      states.delete(id);
    }
  };

  function get(id: string): WorkspaceSnapshot;
  function get(id: string, revision: number): WorkspaceSnapshot | null;
  function get(id: string, revision?: number): WorkspaceSnapshot | null {
    const entries = states.get(id);
    if (revision === undefined) return toSnapshot(id, entries?.at(-1));
    const e = entries?.find((x) => x.revision === revision);
    return e ? toSnapshot(id, e) : null;
  }

  return {
    get,
    set(id, code, source = null) {
      const entries = states.get(id) ?? [];
      const entry: Entry = { code, updatedAt: new Date().toISOString(), revision: (entries.at(-1)?.revision ?? 0) + 1, source };
      states.delete(id); // re-insert so Map order is least-recently-changed first
      entries.push(entry);
      totalChars += code.length;
      while (entries.length > revisionsKept) totalChars -= entries.shift()!.code.length;
      states.set(id, entries);
      evict(id);
      const snap = toSnapshot(id, entry);
      tell(listeners.get(id), notice(snap));
      return snap;
    },
    subscribe: (id, listener) => listen(listeners, id, listener),
    getSituation: (id) => situations.get(id) ?? null,
    setSituation(id, situation) {
      situations.delete(id);
      situations.set(id, situation);
      for (const old of situations.keys()) {
        if (situations.size <= maxWorkspaces) break;
        situations.delete(old);
      }
      tell(situationListeners.get(id), situation);
    },
    subscribeSituation: (id, listener) => listen(situationListeners, id, listener),
    delete(id) {
      const entries = states.get(id);
      for (const e of entries ?? []) totalChars -= e.code.length;
      const had = states.delete(id);
      return situations.delete(id) || had;
    },
  };
}

const g = globalThis as typeof globalThis & { __workspaceHubs?: Map<string, WorkspaceHub> };

/** A game's workspace hub (in-memory, one per game and server process): workspaces are namespaced per game. */
export function getWorkspaceHub(gameId: string): WorkspaceHub {
  const hubs = (g.__workspaceHubs ??= new Map());
  let hub = hubs.get(gameId);
  if (!hub) hubs.set(gameId, (hub = createWorkspaceHub()));
  return hub;
}
