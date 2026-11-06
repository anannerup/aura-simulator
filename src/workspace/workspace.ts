/**
 * The workspace: what the player is working on, held as state codes.
 *
 * For now a workspace holds one item (one aura, or a group with its descendants: one state code).
 * `items` is a list so ticket 12 can add several auras and groups without changing the stored format;
 * nesting lives inside a group's state code, the way the addon stores it.
 */

/** One top-level entry: an aura or a group, as its state code. */
export interface WorkspaceItem {
  code: string;
}

export interface Workspace {
  items: WorkspaceItem[];
  /** ISO time of the last change; decides between browser storage and the server's copy. */
  updatedAt: string;
}

/** The state code the address and the push API speak about: the current (for now: the first) item. */
export function currentCode(workspace: Workspace | null): string | null {
  return workspace?.items[0]?.code ?? null;
}

export function workspaceWithCode(code: string, updatedAt: string = new Date().toISOString()): Workspace {
  return { items: [{ code }], updatedAt };
}

/** Cheap shape check (no decoding): `!WA:2!` followed by LibDeflate's print-safe alphabet. */
export function looksLikeStateCode(text: string): boolean {
  return /^!WA:2![A-Za-z0-9()]+$/.test(text.trim());
}

const STORAGE_FORMAT = "aura-simulator/workspace";
const STORAGE_VERSION = 1;

/** Browser-storage key of a workspace. */
export function storageKey(workspaceId: string): string {
  return `aura-simulator:workspace:${workspaceId}`;
}

/** Stored form (JSON): `{format, version: 1, updatedAt, items: [{code}]}`. */
export function serializeWorkspace(workspace: Workspace): string {
  return JSON.stringify({
    format: STORAGE_FORMAT,
    version: STORAGE_VERSION,
    updatedAt: workspace.updatedAt,
    items: workspace.items.map((i) => ({ code: i.code })),
  });
}

/** Reads the stored form back; null for anything unreadable or from an unknown format version. */
export function parseWorkspace(text: string | null | undefined): Workspace | null {
  if (!text) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.format !== STORAGE_FORMAT || d.version !== STORAGE_VERSION || !Array.isArray(d.items)) return null;
  const items: WorkspaceItem[] = [];
  for (const item of d.items) {
    const code = (item as { code?: unknown } | null)?.code;
    if (typeof code === "string" && looksLikeStateCode(code)) items.push({ code: code.trim() });
  }
  if (items.length === 0) return null;
  const updatedAt =
    typeof d.updatedAt === "string" && !Number.isNaN(Date.parse(d.updatedAt))
      ? d.updatedAt
      : new Date(0).toISOString();
  return { items, updatedAt };
}

/** The newer of two workspaces (the first one on a tie). */
export function newerWorkspace(a: Workspace | null, b: Workspace | null): Workspace | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a;
}
