/**
 * The workspace: what the player is working on, a list of top-level items (auras and groups, see `tree.ts`).
 *
 * Stored form (browser storage in IndexedDB, and the workspace file the player exports/imports), JSON:
 *
 *   { "format": "aura-simulator/workspace", "version": 2, "updatedAt": "<ISO time>",
 *     "selected": "<id>"?,                       // the selected item (optional)
 *     "items": [ { "aura": {...}, "items": [ ... ], "code": "!WA:2!..."? }, ... ] }
 *
 * Each `aura` is the item's canonical aura document (spell IDs and icon file IDs as the addon stores them, no
 * images); `items` is present exactly for groups and nests further. A top-level item may carry its state code
 * (`code`): informational, handy to copy, and lets the page show the very same code again; the documents decide.
 * Version 1 (`items: [{code}]`, one state code per top-level item) is still read and migrated by decoding each code.
 */
import { canonicalize, isLuaTable, type AuraDocument, type AuraState } from "@/core";
import { addSubtree, findNode, isGroupDoc, nodeFromState, normalizeItems, nodeId, type WorkspaceNode } from "./tree";

export interface Workspace {
  items: WorkspaceNode[];
  /** ISO time of the last change; decides between browser storage and the server's copy. */
  updatedAt: string;
  /** The selected item's id, if any. */
  selected?: string | null;
}

/** Decodes a state code (the aura core's `decode`); throws for anything that isn't an aura. */
export type DecodeState = (code: string) => AuraState;

/** Cheap shape check (no decoding): `!WA:2!` followed by LibDeflate's print-safe alphabet. */
export function looksLikeStateCode(text: string): boolean {
  return /^!WA:2![A-Za-z0-9()]+$/.test(text.trim());
}

export const WORKSPACE_FORMAT = "aura-simulator/workspace";
export const WORKSPACE_VERSION = 2;

/** Browser-storage key of a workspace (the IndexedDB record key, and the old localStorage key it migrates from). */
export function storageKey(workspaceId: string): string {
  return `aura-simulator:workspace:${workspaceId}`;
}

/** A workspace from state codes (one top-level item each); clashing ids get the addon's "name 2". */
export function workspaceFromStates(states: AuraState[], updatedAt: string = new Date().toISOString()): Workspace {
  let items: WorkspaceNode[] = [];
  let selected: string | null = null;
  for (const state of states) {
    const added = addSubtree(items, nodeFromState(state), { parentId: null });
    items = added.items;
    selected ??= added.id;
  }
  return { items, updatedAt, selected };
}

/** The stored/exported JSON (`pretty` indents it for a file). */
export function serializeWorkspace(
  workspace: Workspace,
  options: { pretty?: boolean; codeOf?: (node: WorkspaceNode) => string | null } = {},
): string {
  const write = (node: WorkspaceNode): Record<string, unknown> =>
    node.items ? { aura: node.aura, items: node.items.map(write) } : { aura: node.aura };
  const body: Record<string, unknown> = { format: WORKSPACE_FORMAT, version: WORKSPACE_VERSION, updatedAt: workspace.updatedAt };
  if (workspace.selected) body.selected = workspace.selected;
  body.items = normalizeItems(workspace.items).map((node) => {
    const out = write(node);
    const code = options.codeOf?.(node);
    if (code) out.code = code;
    return out;
  });
  return options.pretty ? `${JSON.stringify(body, null, 2)}\n` : JSON.stringify(body);
}

export type ReadResult =
  | {
      ok: true;
      workspace: Workspace;
      /** Unreadable version 1 items left out. */
      skipped: number;
      /** State codes the file carries for its top-level items (unchecked: decode them before trusting them). */
      codes: string[];
    }
  | { ok: false; error: string };

/**
 * Reads a stored workspace or workspace file, checking it strictly: the format, unique ids, groups only where
 * groups may be. Version 1 needs `decode` (codes that don't decode are skipped and counted).
 */
export function readWorkspace(text: string | null | undefined, decode?: DecodeState): ReadResult {
  if (!text) return { ok: false, error: "Empty file" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not JSON" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { ok: false, error: "Not a workspace file" };
  const d = data as Record<string, unknown>;
  if (d.format !== WORKSPACE_FORMAT) return { ok: false, error: `Not a workspace file (format must be "${WORKSPACE_FORMAT}")` };
  if (!Array.isArray(d.items)) return { ok: false, error: "`items` must be an array" };
  const updatedAt =
    typeof d.updatedAt === "string" && !Number.isNaN(Date.parse(d.updatedAt)) ? d.updatedAt : new Date(0).toISOString();

  if (d.version === 1) {
    if (!decode) return { ok: false, error: "Version 1 workspaces need the aura core to read" };
    const states: AuraState[] = [];
    const codes: string[] = [];
    let skipped = 0;
    for (const item of d.items) {
      const code = (item as { code?: unknown } | null)?.code;
      if (typeof code !== "string" || !looksLikeStateCode(code)) {
        skipped++;
        continue;
      }
      try {
        states.push(decode(code.trim()));
        codes.push(code.trim());
      } catch {
        skipped++;
      }
    }
    if (states.length === 0) return { ok: false, error: "No item of this version 1 workspace could be read" };
    return { ok: true, workspace: workspaceFromStates(states, updatedAt), skipped, codes };
  }
  if (d.version !== WORKSPACE_VERSION) return { ok: false, error: `Unknown workspace version ${String(d.version)}` };

  const seen = new Set<string>();
  const readNode = (raw: unknown, where: string, parentDynamic: boolean): WorkspaceNode => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`${where} must be an object`);
    const r = raw as Record<string, unknown>;
    if (typeof r.aura !== "object" || r.aura === null || Array.isArray(r.aura)) throw new Error(`${where}.aura must be an object`);
    let aura: AuraDocument;
    try {
      const c = canonicalize(r.aura as AuraDocument);
      if (!isLuaTable(c) || Array.isArray(c)) throw new Error("not a table with string keys");
      aura = c;
    } catch (e) {
      throw new Error(`${where}.aura is not a valid aura document: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (typeof aura.id !== "string" || !aura.id) throw new Error(`${where}.aura needs an id`);
    if (seen.has(aura.id)) throw new Error(`The id "${aura.id}" is used twice`);
    seen.add(aura.id);
    const group = isGroupDoc(aura);
    if (r.items !== undefined && !group) throw new Error(`"${aura.id}" has items but is not a group`);
    if (group && parentDynamic) throw new Error(`"${aura.id}": a dynamic group can't hold groups`);
    if (!group) return { aura };
    if (r.items !== undefined && !Array.isArray(r.items)) throw new Error(`"${aura.id}".items must be an array`);
    const children = (r.items as unknown[] | undefined) ?? [];
    const dynamic = aura.regionType === "dynamicgroup";
    return { aura, items: children.map((c, i) => readNode(c, `"${aura.id}".items[${i}]`, dynamic)) };
  };
  try {
    const items = normalizeItems(d.items.map((raw, i) => readNode(raw, `items[${i}]`, false)));
    const selected = typeof d.selected === "string" && findNode(items, d.selected) ? d.selected : (items[0] ? nodeId(items[0]) : null);
    const codes = d.items
      .map((raw) => (raw as { code?: unknown }).code)
      .filter((c): c is string => typeof c === "string" && looksLikeStateCode(c))
      .map((c) => c.trim());
    return { ok: true, workspace: { items, updatedAt, selected }, skipped: 0, codes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Lenient read for browser storage: null for anything unreadable. */
export function parseWorkspace(text: string | null | undefined, decode?: DecodeState): Workspace | null {
  const result = readWorkspace(text, decode);
  return result.ok ? result.workspace : null;
}

/** The newer of two workspaces (the first one on a tie). */
export function newerWorkspace<T extends { updatedAt: string }>(a: T | null, b: T | null): T | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a;
}

/** Adds every top-level item of `other` to `base` (ids that clash get the addon's "name 2"). */
export function mergeWorkspaces(base: WorkspaceNode[], other: WorkspaceNode[]): WorkspaceNode[] {
  let items = base;
  for (const node of other) items = addSubtree(items, node, { parentId: null }).items;
  return items;
}
