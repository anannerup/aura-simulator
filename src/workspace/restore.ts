import { mergeTopLevel, nodeId, type WorkspaceNode } from "./tree";
import { newerWorkspace, type Workspace } from "./workspace";

export interface RestoreInput {
  /** What browser storage has for the workspace. */
  stored: Workspace | null;
  /** The server's latest push to the workspace (one aura or group), if any. */
  pushed: { node: WorkspaceNode; updatedAt: string } | null;
  /** Shown when nothing else has an aura. */
  fallback: () => WorkspaceNode;
  /** ISO time of now. */
  now: string;
}

export interface Restored {
  items: WorkspaceNode[];
  selected: string | null;
  updatedAt: string;
  /** True when the result is the server's push (the page shouldn't push it back). */
  fromServer: boolean;
}

/**
 * What a page shows when it opens a workspace: browser storage, unless the server has a newer push (merged in like a
 * live push); the fallback when that leaves nothing.
 */
export function chooseRestore({ stored, pushed, fallback, now }: RestoreInput): Restored {
  let r: Restored = { items: [], selected: null, updatedAt: now, fromServer: false };
  const pushedWs = pushed && { items: [pushed.node], updatedAt: pushed.updatedAt, selected: nodeId(pushed.node) };
  if (stored && pushedWs && newerWorkspace(stored, pushedWs) === pushedWs) {
    const merged = mergeTopLevel(stored.items, pushed!.node);
    r = { ...r, items: merged.items, selected: merged.id, updatedAt: pushedWs.updatedAt, fromServer: true };
  } else if (stored ?? pushedWs) {
    const chosen = (stored ?? pushedWs)!;
    r = { ...r, items: chosen.items, selected: chosen.selected ?? null, updatedAt: chosen.updatedAt, fromServer: !stored };
  }
  if (r.items.length === 0) {
    const node = mergeTopLevel([], fallback());
    r = { ...r, items: node.items, selected: node.id };
  }
  return r;
}
