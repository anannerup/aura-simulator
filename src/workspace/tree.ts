/**
 * The workspace tree: top-level auras, each an aura or a group, groups nesting further items.
 *
 * A node holds the aura's aura document (the addon's own table). The links WeakAuras keeps inside the documents
 * are derived from the tree and kept in step by every operation here (`normalizeItems`):
 * - a group's `controlledChildren` lists its children's `id`s in order (`{}` when empty, the canonical empty table);
 * - a child's `parent` is its group's `id`; top-level auras have no `parent`;
 * - `id`s are unique across the whole workspace, as in the addon's saved variables (`db.displays[id]`).
 *
 * State codes carry a group as the group's document plus its descendants flattened in the order of
 * Private.TraverseAllChildren (WeakAuras.lua:7311-7356, pre-order); see `stateFromNode` and `nodeFromState`.
 */
import { canonicalize, isLuaTable, type AuraDocument, type AuraState, type LuaValue } from "@/core";
import { errorMessage } from "@/lib/errors";

export interface WorkspaceNode {
  aura: AuraDocument;
  /** Present exactly for groups and dynamic groups: the children, in `controlledChildren` order. */
  items?: WorkspaceNode[];
}

/** Private.IsGroupType (WeakAuras.lua:7395): regionType "group" or "dynamicgroup". */
export function isGroupDoc(doc: AuraDocument): boolean {
  return doc.regionType === "group" || doc.regionType === "dynamicgroup";
}

export function isDynamicGroupDoc(doc: AuraDocument): boolean {
  return doc.regionType === "dynamicgroup";
}

/** The document's `id` (empty string when it has none). */
export function nodeId(node: WorkspaceNode): string {
  return typeof node.aura.id === "string" ? node.aura.id : "";
}

/** The ids a document's `controlledChildren` lists (array or `{[1]=...}` form). */
function controlledIds(doc: AuraDocument): string[] | null {
  const cc = doc.controlledChildren;
  if (!isLuaTable(cc)) return null;
  const values = Array.isArray(cc) ? cc : Object.values(cc);
  return values.filter((v): v is string => typeof v === "string");
}

// ---------------------------------------------------------------------------------------------
// Consistency

function sameIds(a: LuaValue | undefined, ids: string[]): boolean {
  if (ids.length === 0) return isLuaTable(a) && !Array.isArray(a) && Object.keys(a).length === 0;
  return Array.isArray(a) && a.length === ids.length && a.every((v, i) => v === ids[i]);
}

/**
 * Returns the items with `controlledChildren` and `parent` derived from the tree. Nodes that are already
 * consistent are returned as they are (same objects), so unchanged subtrees keep their identity.
 */
export function normalizeItems(items: WorkspaceNode[], parentId: string | null = null): WorkspaceNode[] {
  let changed = false;
  const out = items.map((node) => {
    const n = normalizeNode(node, parentId);
    if (n !== node) changed = true;
    return n;
  });
  return changed ? out : items;
}

function normalizeNode(node: WorkspaceNode, parentId: string | null): WorkspaceNode {
  const doc = node.aura;
  const group = isGroupDoc(doc) || node.items !== undefined;
  const id = typeof doc.id === "string" ? doc.id : "";
  const items = group ? normalizeItems(node.items ?? [], id) : undefined;
  const childIds = items?.map(nodeId) ?? [];
  const parentOk = parentId === null ? !("parent" in doc) : doc.parent === parentId;
  const childrenOk = group ? sameIds(doc.controlledChildren, childIds) : !("controlledChildren" in doc);
  if (parentOk && childrenOk && items === node.items) return node;
  const aura: AuraDocument = { ...doc };
  if (parentId === null) delete aura.parent;
  else aura.parent = parentId;
  if (group) aura.controlledChildren = childIds.length ? childIds : {};
  else delete aura.controlledChildren;
  return items ? { aura, items } : { aura };
}

// ---------------------------------------------------------------------------------------------
// Lookup

export interface Located {
  node: WorkspaceNode;
  /** The group holding it; null at top level. */
  parent: WorkspaceNode | null;
  index: number;
  /** Ids from the top-level aura down to the node itself. */
  path: string[];
}

export function findNode(items: WorkspaceNode[], id: string): Located | null {
  const walk = (list: WorkspaceNode[], parent: WorkspaceNode | null, path: string[]): Located | null => {
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      const p = [...path, nodeId(node)];
      if (nodeId(node) === id) return { node, parent, index: i, path: p };
      if (node.items) {
        const found = walk(node.items, node, p);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(items, null, []);
}

/** Every node, pre-order (the order of Private.TraverseAll). */
export function* traverse(items: WorkspaceNode[]): Generator<WorkspaceNode> {
  for (const node of items) {
    yield node;
    if (node.items) yield* traverse(node.items);
  }
}

export function allIds(items: WorkspaceNode[]): Set<string> {
  return new Set(Array.from(traverse(items), nodeId));
}

function allUids(items: WorkspaceNode[]): Set<string> {
  const uids = new Set<string>();
  for (const n of traverse(items)) if (typeof n.aura.uid === "string") uids.add(n.aura.uid);
  return uids;
}

// ---------------------------------------------------------------------------------------------
// Ids and uids

/** Private.FindUnusedId (WeakAuras.lua): `prefix`, else "prefix 2", "prefix 3", ... */
export function uniqueId(taken: ReadonlySet<string>, prefix: string): string {
  const base = prefix.trim() || "New";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base} ${n}`;
    if (!taken.has(id)) return id;
  }
}

const UID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()";

/** GenerateUniqueID (Transmission.lua:97): 11 characters of the addon's base64 alphabet. */
export function newUid(): string {
  const bytes = new Uint8Array(11);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => UID_ALPHABET[b % 64]).join("");
}

/**
 * Gives a subtree ids and uids that don't clash with `takenIds`/`takenUids` (adding the ones it uses), the way the
 * addon's import picks a free id for a clashing one.
 */
function makeUnique(node: WorkspaceNode, takenIds: Set<string>, takenUids: Set<string>): WorkspaceNode {
  const id = uniqueId(takenIds, nodeId(node) || "New");
  takenIds.add(id);
  const aura: AuraDocument = { ...node.aura, id };
  const uid = typeof aura.uid === "string" ? aura.uid : null;
  if (!uid || takenUids.has(uid)) aura.uid = newUid();
  takenUids.add(aura.uid as string);
  const items = node.items?.map((c) => makeUnique(c, takenIds, takenUids));
  return items ? { aura, items } : { aura };
}

// ---------------------------------------------------------------------------------------------
// Operations. Each returns new, normalized items and throws a TreeError when the edit isn't allowed.

export class TreeError extends Error {}

/** Where an aura goes: into a group (`parentId`) or the top level (null), at `index` (default: the end). */
export interface Target {
  parentId: string | null;
  index?: number;
}

function childrenOf(items: WorkspaceNode[], parentId: string | null): WorkspaceNode[] {
  if (parentId === null) return items;
  const found = findNode(items, parentId);
  if (!found) throw new TreeError(`No aura "${parentId}"`);
  if (!found.node.items) throw new TreeError(`"${parentId}" is not a group`);
  return found.node.items;
}

/** Replaces the children list of `parentId` (or the top level) via `edit`. */
function editChildren(
  items: WorkspaceNode[],
  parentId: string | null,
  edit: (children: WorkspaceNode[]) => WorkspaceNode[],
): WorkspaceNode[] {
  if (parentId === null) return edit(items);
  const rec = (list: WorkspaceNode[]): WorkspaceNode[] =>
    list.map((node) => {
      if (nodeId(node) === parentId && node.items) return { ...node, items: edit(node.items) };
      return node.items ? { ...node, items: rec(node.items) } : node;
    });
  return rec(items);
}

function checkCanHold(items: WorkspaceNode[], parentId: string | null, node: WorkspaceNode) {
  if (parentId === null) return;
  const parent = findNode(items, parentId)?.node;
  if (!parent?.items) throw new TreeError(`"${parentId}" is not a group`);
  // The options only offer plain groups as targets for a group (AceGUIWidget-WeakAurasDisplayButton.lua:1209).
  if (isDynamicGroupDoc(parent.aura) && node.items) throw new TreeError("A dynamic group can't hold groups");
}

/**
 * Adds a subtree (e.g. an imported state code). Clashing ids get the addon's "name 2" treatment and clashing uids a
 * new uid. Returns the new items and the (possibly renamed) id of the subtree's root.
 */
export function addSubtree(items: WorkspaceNode[], node: WorkspaceNode, target: Target): { items: WorkspaceNode[]; id: string } {
  checkCanHold(items, target.parentId, node);
  const fresh = makeUnique(node, allIds(items), allUids(items));
  const next = editChildren(items, target.parentId, (children) => {
    const out = [...children];
    out.splice(target.index ?? out.length, 0, fresh);
    return out;
  });
  return { items: normalizeItems(next), id: nodeId(fresh) };
}

export function removeNode(items: WorkspaceNode[], id: string): WorkspaceNode[] {
  const found = findNode(items, id);
  if (!found) throw new TreeError(`No aura "${id}"`);
  const parentId = found.parent ? nodeId(found.parent) : null;
  return normalizeItems(editChildren(items, parentId, (children) => children.filter((_, i) => i !== found.index)));
}

/** Moves an aura into a group or to the top level. `index` counts in the target list without the moved aura. */
export function moveNode(items: WorkspaceNode[], id: string, target: Target): WorkspaceNode[] {
  const found = findNode(items, id);
  if (!found) throw new TreeError(`No aura "${id}"`);
  if (target.parentId !== null) {
    const parent = findNode(items, target.parentId);
    if (!parent) throw new TreeError(`No aura "${target.parentId}"`);
    if (parent.path.includes(id)) throw new TreeError("An aura can't go into itself");
  }
  checkCanHold(items, target.parentId, found.node);
  const without = removeNode(items, id);
  const next = editChildren(without, target.parentId, (children) => {
    const out = [...children];
    const index = Math.max(0, Math.min(target.index ?? out.length, out.length));
    out.splice(index, 0, found.node);
    return out;
  });
  return normalizeItems(next);
}

/** Moves an aura one place up or down among its siblings. */
export function shiftNode(items: WorkspaceNode[], id: string, delta: -1 | 1): WorkspaceNode[] {
  const found = findNode(items, id);
  if (!found) throw new TreeError(`No aura "${id}"`);
  const parentId = found.parent ? nodeId(found.parent) : null;
  const siblings = childrenOf(items, parentId).length;
  const index = found.index + delta;
  if (index < 0 || index >= siblings) return items;
  return moveNode(items, id, { parentId, index });
}

/** Renames an aura; ids must be non-empty and unique across the workspace. */
export function renameNode(items: WorkspaceNode[], id: string, newId: string): WorkspaceNode[] {
  const name = newId.trim();
  if (!name) throw new TreeError("A name can't be empty");
  if (name === id) return items;
  const found = findNode(items, id);
  if (!found) throw new TreeError(`No aura "${id}"`);
  if (allIds(items).has(name)) throw new TreeError(`There is already an aura named "${name}"`);
  const rec = (list: WorkspaceNode[]): WorkspaceNode[] =>
    list.map((node) => {
      let n = node;
      if (nodeId(node) === id) n = { ...node, aura: { ...node.aura, id: name } };
      else if (found.parent && node === found.parent) n = { ...node, aura: renameHybridKey(node.aura, id, name) };
      return n.items ? { ...n, items: rec(n.items) } : n;
    });
  return normalizeItems(rec(items));
}

/** A dynamic group's `sortHybridTable` is keyed by child id. */
function renameHybridKey(doc: AuraDocument, from: string, to: string): AuraDocument {
  const table = doc.sortHybridTable;
  if (!isLuaTable(table) || Array.isArray(table) || !(from in table)) return doc;
  const next = { ...table, [to]: table[from] };
  delete next[from];
  return { ...doc, sortHybridTable: next };
}

/** A deep copy of an aura placed right after it, with fresh ids ("name 2") and uids. */
export function duplicateNode(items: WorkspaceNode[], id: string): { items: WorkspaceNode[]; id: string } {
  const found = findNode(items, id);
  if (!found) throw new TreeError(`No aura "${id}"`);
  const strip = (n: WorkspaceNode): WorkspaceNode => {
    const aura = { ...n.aura };
    delete aura.uid;
    return n.items ? { aura, items: n.items.map(strip) } : { aura };
  };
  return addSubtree(items, strip(found.node), {
    parentId: found.parent ? nodeId(found.parent) : null,
    index: found.index + 1,
  });
}

/**
 * Replaces an aura's document (e.g. from an editor). A changed `id` is a rename (and must be unique); the tree
 * decides `controlledChildren` and `parent`. A group with children can't stop being a group.
 */
export function updateNode(items: WorkspaceNode[], id: string, doc: AuraDocument): { items: WorkspaceNode[]; id: string } {
  const found = findNode(items, id);
  if (!found) throw new TreeError(`No aura "${id}"`);
  let aura: AuraDocument;
  try {
    const c = canonicalize(doc);
    if (!isLuaTable(c) || Array.isArray(c)) throw new Error("An aura must be a table with string keys");
    aura = c;
  } catch (e) {
    throw new TreeError(errorMessage(e));
  }
  const newId = typeof aura.id === "string" ? aura.id.trim() : "";
  if (!newId) throw new TreeError("An aura needs an id");
  const group = isGroupDoc(aura);
  if (!group && found.node.items?.length) throw new TreeError("A group with children can't become an aura");
  if (group && found.parent && isDynamicGroupDoc(found.parent.aura)) throw new TreeError("A dynamic group can't hold groups");
  if (group && isDynamicGroupDoc(aura) && found.node.items?.some((c) => c.items)) {
    throw new TreeError("A dynamic group can't hold groups");
  }
  let next = newId !== id ? renameNode(items, id, newId) : items;
  aura = { ...aura, id: newId };
  const rec = (list: WorkspaceNode[]): WorkspaceNode[] =>
    list.map((node) => {
      if (nodeId(node) === newId) return group ? { aura, items: node.items ?? [] } : { aura };
      return node.items ? { ...node, items: rec(node.items) } : node;
    });
  next = rec(next);
  return { items: normalizeItems(next), id: newId };
}

/**
 * Replaces a group's document together with its descendants' (the window's tabs edit a group's children too, as in
 * the game). Descendants whose document didn't change keep their node.
 */
export function updateWithDescendants(
  items: WorkspaceNode[],
  id: string,
  doc: AuraDocument,
  descendants: AuraDocument[],
): { items: WorkspaceNode[]; id: string } {
  let next = items;
  for (const child of descendants) {
    const childId = typeof child.id === "string" ? child.id : null;
    const found = childId ? findNode(next, childId) : null;
    if (childId && found && JSON.stringify(found.node.aura) !== JSON.stringify(canonicalize(child))) {
      next = updateNode(next, childId, child).items;
    }
  }
  return updateNode(next, id, doc);
}

/**
 * Merges a pushed or pasted aura into the top level, like the addon's import updates an installed aura: it
 * replaces the top-level aura with the same `uid` (else the same `id`), keeping its place, or is appended.
 */
export function mergeTopLevel(items: WorkspaceNode[], node: WorkspaceNode): { items: WorkspaceNode[]; id: string } {
  const uid = typeof node.aura.uid === "string" ? node.aura.uid : null;
  let index = uid ? items.findIndex((n) => n.aura.uid === uid) : -1;
  if (index < 0) index = items.findIndex((n) => nodeId(n) === nodeId(node));
  if (index < 0) return addSubtree(items, node, { parentId: null });
  const rest = items.filter((_, i) => i !== index);
  const fresh = makeUnique(node, allIds(rest), allUids(rest));
  const next = [...rest];
  next.splice(index, 0, fresh);
  return { items: normalizeItems(next), id: nodeId(fresh) };
}

// ---------------------------------------------------------------------------------------------
// New items

/** Where a new aura goes when `selectedId` is selected: into a selected group, else right after the selected aura. */
export function insertionTarget(items: WorkspaceNode[], selectedId: string | null, isGroup: boolean): Target {
  const found = selectedId ? findNode(items, selectedId) : null;
  if (!found) return { parentId: null };
  if (found.node.items && !(isGroup && isDynamicGroupDoc(found.node.aura))) return { parentId: selectedId };
  const parent = found.parent;
  if (parent && !(isGroup && isDynamicGroupDoc(parent.aura))) return { parentId: nodeId(parent), index: found.index + 1 };
  // Top level, or a group next to a child of a dynamic group: after the top-level aura.
  const top = items.findIndex((n) => nodeId(n) === found.path[0]);
  return { parentId: null, index: top + 1 };
}

/**
 * Adds an aura the addon's New Aura made (`WeakAuras.NewAura`), named "New" as in the game, where the game puts it:
 * into a selected group, else after the selection. In a group it is placed beside its future siblings so it doesn't
 * hide them (the game puts it on top of them).
 */
export function placeNewAura(items: WorkspaceNode[], selectedId: string | null, made: AuraDocument): { items: WorkspaceNode[]; id: string } {
  const group = isGroupDoc(made);
  const target = insertionTarget(items, selectedId, group);
  const aura: AuraDocument = { ...made, id: "New" };
  delete aura.uid;
  const siblings = target.parentId ? (findNode(items, target.parentId)?.node.items?.length ?? 0) : 0;
  if (!group && siblings > 0) aura.xOffset = siblings * ((typeof aura.width === "number" ? aura.width : 64) + 4);
  return addSubtree(items, group ? { aura, items: [] } : { aura }, target);
}

// ---------------------------------------------------------------------------------------------
// State codes

/**
 * The state of an aura as the addon exports it (Private.DisplayToString, Transmission.lua:447-485): its document
 * and, for a group, every descendant in TraverseAllChildren order. The root's `parent` is left out: it only means
 * something inside this workspace, and the addon's import sets its own (Update.lua GetPhase2Data, rootParent).
 */
export function stateFromNode(node: WorkspaceNode): AuraState {
  const [root] = normalizeItems([node]);
  const children: AuraDocument[] = [];
  if (root.items) for (const n of traverse(root.items)) children.push(n.aura);
  return { aura: root.aura, children };
}

/** A key equal for equal states, whatever the key order of their tables (a code's table order isn't kept). */
export function stateKey(state: AuraState): string {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable);
    if (typeof v !== "object" || v === null) return v;
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, stable(o[k])]),
    );
  };
  return JSON.stringify(stable({ aura: state.aura, children: state.children }));
}

/**
 * Rebuilds an aura from a decoded state code. As the addon's import does (Transmission.lua:642-649 and 807-814),
 * a code without sub groups (transmission version 1421, where `controlledChildren`/`parent` aren't sent) makes
 * every child a direct child of the root, in order; with sub groups (2000) the nesting follows `controlledChildren`.
 * Children no group lists are kept, under the root.
 */
export function nodeFromState(state: AuraState): WorkspaceNode {
  const children = state.children;
  const root = state.aura;
  const isGroupLike = (d: AuraDocument) => isGroupDoc(d) || "controlledChildren" in d;
  if (!isGroupLike(root) && children.length === 0) return normalizeItems([{ aura: root }])[0];
  const hasSubGroups = children.some(isGroupLike);
  if (!hasSubGroups) {
    return normalizeItems([{ aura: root, items: children.map((aura) => ({ aura })) }])[0];
  }
  const byId = new Map<string, AuraDocument>();
  for (const c of children) if (typeof c.id === "string" && !byId.has(c.id)) byId.set(c.id, c);
  const used = new Set<AuraDocument>();
  const build = (doc: AuraDocument): WorkspaceNode => {
    used.add(doc);
    if (!isGroupLike(doc)) return { aura: doc };
    const items: WorkspaceNode[] = [];
    for (const id of controlledIds(doc) ?? []) {
      const child = byId.get(id);
      if (child && !used.has(child)) items.push(build(child));
    }
    return { aura: doc, items };
  };
  const node = build(root);
  const leftovers = children.filter((c) => !used.has(c)).map((c) => build(c));
  return normalizeItems([{ ...node, items: [...(node.items ?? []), ...leftovers] }])[0];
}
