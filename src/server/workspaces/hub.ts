/**
 * Workspaces on the server: the latest state code per workspace ID and the pages listening to it.
 * Held in memory only (the browser keeps the workspace; the spec puts server-side workspace storage out
 * of scope), capped so a public deployment can't grow it without bound.
 */

export interface WorkspaceSnapshot {
  id: string;
  /** The current state code, or null when nothing has been pushed or loaded since the server started. */
  code: string | null;
  updatedAt: string | null;
  /** Increases with every change; 0 when empty. */
  revision: number;
}

export type WorkspaceListener = (snapshot: WorkspaceSnapshot) => void;

export interface WorkspaceHub {
  get(id: string): WorkspaceSnapshot;
  /** Sets the workspace's state code and tells every listener. */
  set(id: string, code: string): WorkspaceSnapshot;
  /** Returns an unsubscribe function. */
  subscribe(id: string, listener: WorkspaceListener): () => void;
}

const MAX_WORKSPACES = 1000;

export function createWorkspaceHub(): WorkspaceHub {
  const states = new Map<string, { code: string; updatedAt: string; revision: number }>();
  const listeners = new Map<string, Set<WorkspaceListener>>();

  const snapshot = (id: string): WorkspaceSnapshot => {
    const s = states.get(id);
    return { id, code: s?.code ?? null, updatedAt: s?.updatedAt ?? null, revision: s?.revision ?? 0 };
  };

  return {
    get: snapshot,
    set(id, code) {
      const revision = (states.get(id)?.revision ?? 0) + 1;
      states.delete(id); // re-insert so Map order is least-recently-changed first
      states.set(id, { code, updatedAt: new Date().toISOString(), revision });
      while (states.size > MAX_WORKSPACES) {
        const oldest = states.keys().next().value as string;
        states.delete(oldest);
      }
      const snap = snapshot(id);
      for (const listener of listeners.get(id) ?? []) {
        try {
          listener(snap);
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
