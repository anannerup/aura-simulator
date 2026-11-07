"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { AuraDocument } from "@/core";
import { ADDON_MEDIA, GameTexture, SearchIcon } from "@/components/ui";
import { useAuraIconUrl } from "@/render/textures";
import {
  allIds,
  duplicateNode,
  findNode,
  isDynamicGroupDoc,
  moveNode,
  nodeId,
  removeNode,
  renameNode,
  shiftNode,
  traverse,
  type Target,
  type WorkspaceNode,
} from "@/workspace";
import styles from "./WorkspaceTree.module.css";
import { errorMessage } from "@/lib/errors";

export interface WorkspaceTreeProps {
  /** The workspace's top-level items. */
  items: WorkspaceNode[];
  selectedId: string | null;
  onSelect(id: string): void;
  /** A tree edit: the new items (normalized: ids, `controlledChildren` and `parent` consistent) and what to select. */
  onChange(items: WorkspaceNode[], selectedId: string | null): void;
  /** Auras hidden in the preview (as if their trigger were inactive); shows an eye toggle per aura when given. */
  hiddenIds?: ReadonlySet<string>;
  onToggleHidden?(id: string): void;
}

type Drop = { id: string; where: "before" | "after" | "inside" };

const KIND_LABEL: Record<string, string> = { group: "Group", dynamicgroup: "Dynamic group" };

/** Region types whose list thumbnail is their icon; the others get a glyph, as their art is not an icon. */
const ICON_THUMB_TYPES = new Set(["icon", "aurabar"]);
const THUMB_GLYPHS: Record<string, string> = { text: "Aa", texture: "▧", progresstexture: "◔", stopmotion: "◎", model: "☗" };

/** The first aura (not group) in a subtree: a group's thumbnail shows its first child's icon, as in game. */
function firstLeaf(node: WorkspaceNode): WorkspaceNode | null {
  if (!node.items) return node;
  for (const child of node.items) {
    const leaf = firstLeaf(child);
    if (leaf) return leaf;
  }
  return null;
}

function IconThumb({ aura }: { aura: AuraDocument }) {
  const url = useAuraIconUrl(aura);
  // A Wowhead icon URL (external image); next/image would need its host configured for no gain.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" draggable={false} /> : null;
}

/** The aura list's thumbnail: the aura's icon (or its first child's, for a group), else a glyph for its type. */
function Thumb({ node }: { node: WorkspaceNode }) {
  const leaf = firstLeaf(node);
  const type = String(leaf?.aura.regionType ?? "");
  let content: ReactNode = <span className={styles.thumbGlyph}>{THUMB_GLYPHS[type] ?? "?"}</span>;
  if (leaf && ICON_THUMB_TYPES.has(type)) content = <IconThumb aura={leaf.aura} />;
  return (
    <span className={styles.thumb} data-group={node.items ? true : undefined} aria-hidden>
      {content}
    </span>
  );
}

/** A node matches the search when its name or a descendant's does. */
function matches(node: WorkspaceNode, query: string): boolean {
  if (!query) return true;
  if (nodeId(node).toLowerCase().includes(query)) return true;
  return (node.items ?? []).some((child) => matches(child, query));
}

const actionIcon = (name: string) => <GameTexture source={ADDON_MEDIA(name)} size={16} />;

/**
 * The workspace's auras and groups as a tree, with the addon's rules: unique ids, dynamic groups hold no groups.
 * Self-contained: every edit is a pure operation from `@/workspace`, handed to `onChange`. New auras and groups come
 * from the window's New Aura page (the addon's own), not from here.
 */
export function WorkspaceTree({ items, selectedId, onSelect, onChange, hiddenIds, onToggleHidden }: WorkspaceTreeProps) {
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  // Enter commits and unmounts the input, whose blur would commit the same rename again.
  const renameDone = useRef<{ id: string; value: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const selected = selectedId ? findNode(items, selectedId) : null;

  function apply(edit: () => { items: WorkspaceNode[]; select: string | null }) {
    try {
      const next = edit();
      setError(null);
      onChange(next.items, next.select);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }

  function remove() {
    if (!selected) return;
    apply(() => {
      const next = removeNode(items, selectedId!);
      const siblings = selected.parent ? (findNode(next, nodeId(selected.parent))?.node.items ?? []) : next;
      const neighbour = siblings[Math.min(selected.index, siblings.length - 1)];
      const select = neighbour ? nodeId(neighbour) : selected.parent ? nodeId(selected.parent) : null;
      return { items: next, select };
    });
  }

  function commitRename() {
    if (!renaming || renameDone.current === renaming) return;
    renameDone.current = renaming;
    const ok = apply(() => {
      const next = renameNode(items, renaming.id, renaming.value);
      return { items: next, select: renaming.value.trim() };
    });
    if (ok) setRenaming(null);
  }

  function move(id: string, target: Target) {
    apply(() => ({ items: moveNode(items, id, target), select: id }));
  }

  // Groups an item may move into: not itself or below itself, and no group into a dynamic group.
  const moveTargets: { id: string | null; label: string }[] = [{ id: null, label: "Top level" }];
  if (selected) {
    for (const n of traverse(items)) {
      if (!n.items || findNode(items, nodeId(n))!.path.includes(selectedId!)) continue;
      if (selected.node.items && isDynamicGroupDoc(n.aura)) continue;
      moveTargets.push({ id: nodeId(n), label: nodeId(n) });
    }
  }
  const currentParent = selected?.parent ? nodeId(selected.parent) : null;

  function onDragOver(e: DragEvent, node: WorkspaceNode) {
    if (!dragId || dragId === nodeId(node)) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    const f = (e.clientY - box.top) / box.height;
    const where: Drop["where"] = node.items ? (f < 0.25 ? "before" : f > 0.75 ? "after" : "inside") : f < 0.5 ? "before" : "after";
    if (drop?.id !== nodeId(node) || drop.where !== where) setDrop({ id: nodeId(node), where });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const d = drop;
    const id = dragId;
    setDrop(null);
    setDragId(null);
    if (!d || !id) return;
    if (d.where === "inside") return move(id, { parentId: d.id });
    const target = findNode(items, d.id);
    if (!target) return;
    const parentId = target.parent ? nodeId(target.parent) : null;
    // Indexes count without the moved item.
    const moving = findNode(items, id)!;
    const sameList = (moving.parent ? nodeId(moving.parent) : null) === parentId;
    let index = target.index + (d.where === "after" ? 1 : 0);
    if (sameList && moving.index < index) index--;
    move(id, { parentId, index });
  }

  function onRowKey(e: KeyboardEvent, id: string) {
    if (e.key === "F2") setRenaming({ id, value: id });
    else if (e.key === "Delete") remove();
  }

  const renderNodes = (list: WorkspaceNode[], level: number): ReactNode[] =>
    list.filter((node) => matches(node, search)).map((node) => {
      const id = nodeId(node);
      const isSelected = id === selectedId;
      const kind = KIND_LABEL[String(node.aura.regionType)];
      const hidden = hiddenIds?.has(id) ?? false;
      const dropClass =
        drop?.id === id ? (drop.where === "inside" ? styles.dropInside : drop.where === "before" ? styles.dropBefore : styles.dropAfter) : "";
      return (
        <li key={id} role="none">
          <div
            role="treeitem"
            aria-level={level}
            aria-selected={isSelected}
            aria-expanded={node.items ? true : undefined}
            aria-label={id}
            data-item-id={id}
            tabIndex={isSelected ? 0 : -1}
            className={`${styles.row} ${isSelected ? styles.selected : ""} ${dropClass}`}
            style={{ paddingLeft: 3 + (level - 1) * 14 }}
            draggable={!renaming}
            onDragStart={(e) => {
              setDragId(id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDrop(null);
            }}
            onDragOver={(e) => onDragOver(e, node)}
            onDrop={onDrop}
            onClick={() => onSelect(id)}
            onDoubleClick={() => setRenaming({ id, value: id })}
            onKeyDown={(e) => onRowKey(e, id)}
          >
            <Thumb node={node} />
            {renaming?.id === id ? (
              <input
                className={styles.renameInput}
                aria-label="New name"
                autoFocus
                value={renaming.value}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRenaming({ id, value: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenaming(null);
                }}
                onBlur={commitRename}
              />
            ) : (
              <span className={styles.label}>
                <span className={styles.name}>{id}</span>
                {kind && <span className={styles.badge}>{kind}</span>}
              </span>
            )}
            {onToggleHidden && !node.items && (
              <button
                type="button"
                className={styles.eye}
                aria-label={hidden ? `Show ${id}` : `Hide ${id}`}
                aria-pressed={hidden}
                title={hidden ? "Hidden in the preview" : "Shown in the preview"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleHidden(id);
                }}
              >
                <GameTexture source={ADDON_MEDIA(hidden ? "unloaded" : "loaded")} size={14} />
              </button>
            )}
          </div>
          {node.items && node.items.length > 0 && (
            <ul role="group" className={styles.list}>
              {renderNodes(node.items, level + 1)}
            </ul>
          )}
        </li>
      );
    });

  return (
    <section className={styles.tree} aria-label="Workspace items">
      <label className={styles.search}>
        <SearchIcon size={13} aria-hidden />
        <input type="search" placeholder="Search" aria-label="Search auras" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className={styles.listHeader}>
        <span>Loaded/Standby</span>
        <span className={styles.listCount}>{allIds(items).size}</span>
      </div>
      <ul
        role="tree"
        aria-label="Auras and groups"
        className={styles.list}
        onDragOver={(e) => dragId && e.preventDefault()}
        onDrop={(e) => {
          // Dropped on empty space: to the end of the top level.
          if (drop || !dragId) return;
          e.preventDefault();
          const id = dragId;
          setDragId(null);
          move(id, { parentId: null });
        }}
      >
        {renderNodes(items, 1)}
        {items.length === 0 && <li className={styles.empty}>The workspace is empty. Add an aura or paste a state code.</li>}
        {items.length > 0 && search && !items.some((n) => matches(n, search)) && <li className={styles.empty}>No aura matches “{query.trim()}”.</li>}
      </ul>
      {selected && (
        <div className={styles.actions} aria-label="Selected item">
          <button type="button" aria-label="Rename" title="Rename (F2)" onClick={() => setRenaming({ id: selectedId!, value: selectedId! })}>
            {actionIcon("edit")}
          </button>
          <button type="button" aria-label="Duplicate" title="Duplicate" onClick={() => apply(() => {
            const d = duplicateNode(items, selectedId!);
            return { items: d.items, select: d.id };
          })}>
            {actionIcon("duplicate")}
          </button>
          <button type="button" aria-label="Delete" title="Delete" onClick={remove}>
            {actionIcon("delete")}
          </button>
          <button type="button" aria-label="Move up" title="Move up" onClick={() => apply(() => ({ items: shiftNode(items, selectedId!, -1), select: selectedId }))}>
            {actionIcon("moveup")}
          </button>
          <button type="button" aria-label="Move down" title="Move down" onClick={() => apply(() => ({ items: shiftNode(items, selectedId!, 1), select: selectedId }))}>
            {actionIcon("movedown")}
          </button>
          <label className={styles.moveTo}>
            In
            <select
              aria-label="Move to group"
              value={currentParent ?? ""}
              onChange={(e) => move(selectedId!, { parentId: e.target.value === "" ? null : e.target.value })}
            >
              {moveTargets.map((t) => (
                <option key={t.id ?? ""} value={t.id ?? ""}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
