/**
 * The pushes recently sent to each workspace ID, and the pages listening. Held in memory only (the browser keeps the
 * workspace; the server only keeps recent pushes), capped by workspace count and total size so a public deployment
 * can't grow it without bound.
 *
 * Listeners get a notice (revision, time, source), never the code: codes can be megabytes, and a page fetches the
 * revision it needs. The last few revisions per workspace are kept so a page can fetch each in turn.
 */
import type { WorkspaceNotice, WorkspaceSnapshot } from "@/workspace";

export type WorkspaceListener = (notice: WorkspaceNotice) => void;

export interface WorkspaceHub {
  /** The latest snapshot, or (with `revision`) that recent revision; null when it is no longer kept. */
  get(id: string): WorkspaceSnapshot;
  get(id: string, revision: number): WorkspaceSnapshot | null;
  /** Records a push and tells every listener. */
  set(id: string, code: string, source?: string | null): WorkspaceSnapshot;
  /** Returns an unsubscribe function. */
  subscribe(id: string, listener: WorkspaceListener): () => void;
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
  let totalChars = 0;

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
      const n = notice(snap);
      for (const listener of listeners.get(id) ?? []) {
        try {
          listener(n);
        } catch {
          // A broken listener (closed stream) must not stop the others.
        }
      }
      return snap;
    },
    subscribe(id, listener) {
      let set = listeners.get(id);
      if (!set) listeners.set(id, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(id);
      };
    },
  };
}

const g = globalThis as typeof globalThis & { __workspaceHub?: WorkspaceHub };

/** The app's workspace hub (in-memory, one per server process). */
export function getWorkspaceHub(): WorkspaceHub {
  g.__workspaceHub ??= createWorkspaceHub();
  return g.__workspaceHub;
}
