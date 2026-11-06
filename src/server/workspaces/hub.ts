/**
 * Workspaces on the server: the state codes recently pushed or changed per workspace ID, and the pages listening.
 * Held in memory only (the browser keeps the workspace; the spec puts server-side workspace storage out of scope),
 * capped by workspace count and total size so a public deployment can't grow it without bound.
 *
 * Listeners get a **notice** (revision, time, source), never the code: codes can be megabytes, and a page fetches
 * the revision it needs. The last few revisions per workspace are kept so a page can fetch each in turn.
 */

export interface WorkspaceSnapshot {
  id: string;
  /** The current state code, or null when nothing has been pushed or loaded since the server started. */
  code: string | null;
  updatedAt: string | null;
  /** Increases with every change; 0 when empty. */
  revision: number;
  /** The page that sent this change (its client header), or null for an agent's push. */
  source: string | null;
}

/** What listeners hear about a change: everything but the code. */
export type WorkspaceNotice = Omit<WorkspaceSnapshot, "code">;

export type WorkspaceListener = (notice: WorkspaceNotice) => void;

export interface WorkspaceHub {
  /** The latest snapshot, or (with `revision`) that recent revision; null when it is no longer kept. */
  get(id: string): WorkspaceSnapshot;
  get(id: string, revision: number): WorkspaceSnapshot | null;
  /** Sets the workspace's state code and tells every listener. */
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

export const notice = ({ id, updatedAt, revision, source }: WorkspaceSnapshot): WorkspaceNotice => ({
  id,
  updatedAt,
  revision,
  source,
});

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

  const dropOldest = () => {
    // Old revisions of the least recently changed workspaces go first; a workspace's latest code goes last.
    for (const [id, entries] of states) {
      while (entries.length > 1 && totalChars > maxTotalChars) totalChars -= entries.shift()!.code.length;
      if (totalChars <= maxTotalChars) return;
      if (states.size === 1) return; // the only workspace keeps its latest code
      totalChars -= entries.reduce((n, e) => n + e.code.length, 0);
      states.delete(id);
      if (totalChars <= maxTotalChars) return;
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
      const revision = (entries.at(-1)?.revision ?? 0) + 1;
      states.delete(id); // re-insert so Map order is least-recently-changed first
      entries.push({ code, updatedAt: new Date().toISOString(), revision, source });
      totalChars += code.length;
      while (entries.length > revisionsKept) totalChars -= entries.shift()!.code.length;
      states.set(id, entries);
      while (states.size > maxWorkspaces) {
        const [oldest, old] = states.entries().next().value as [string, Entry[]];
        totalChars -= old.reduce((n, e) => n + e.code.length, 0);
        states.delete(oldest);
      }
      if (totalChars > maxTotalChars) dropOldest();
      const snap = toSnapshot(id, states.get(id)?.at(-1) ?? entries.at(-1));
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
