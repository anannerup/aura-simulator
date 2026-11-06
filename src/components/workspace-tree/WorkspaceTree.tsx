"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import {
  addSubtree,
  allIds,
  duplicateNode,
  findNode,
  insertionTarget,
  isDynamicGroupDoc,
  moveNode,
  newAuraNode,
  newGroupNode,
  nodeId,
  removeNode,
  renameNode,
  shiftNode,
  traverse,
  uniqueId,
  type GroupKind,
  type Target,
  type WorkspaceNode,
} from "@/workspace";
import styles from "./WorkspaceTree.module.css";

export interface WorkspaceTreeProps {
  /** The workspace's top-level items. */
  items: WorkspaceNode[];
  selectedId: string | null;
  onSelect(id: string): void;
  /** A tree edit: the new items (normalized: ids, `controlledChildren` and `parent` consistent) and what to select. */
  onChange(items: WorkspaceNode[], selectedId: string | null): void;
  /** The addon's internalVersion, written into new auras and groups. */
  internalVersion: number;
  /** Auras hidden in the preview (as if their trigger were inactive); shows an eye toggle per aura when given. */
  hiddenIds?: ReadonlySet<string>;
  onToggleHidden?(id: string): void;
}

type Drop = { id: string; where: "before" | "after" | "inside" };

const KIND_LABEL: Record<string, string> = { group: "Group", dynamicgroup: "Dynamic group" };

/**
 * The workspace's auras and groups as a tree, with the addon's rules: unique ids, dynamic groups hold no groups.
 * Self-contained: every edit is a pure operation from `@/workspace`, handed to `onChange`.
 */
export function WorkspaceTree({ items, selectedId, onSelect, onChange, internalVersion, hiddenIds, onToggleHidden }: WorkspaceTreeProps) {
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  // Enter commits and unmounts the input, whose blur would commit the same rename again.
  const renameDone = useRef<{ id: string; value: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const selected = selectedId ? findNode(items, selectedId) : null;

  function apply(edit: () => { items: WorkspaceNode[]; select: string | null }) {
    try {
      const next = edit();
      setError(null);
      onChange(next.items, next.select);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  function addAura() {
    apply(() => {
      const target = insertionTarget(items, selectedId, false);
      const siblings = target.parentId ? (findNode(items, target.parentId)?.node.items?.length ?? 0) : 0;
      const node = newAuraNode(internalVersion, uniqueId(allIds(items), "New"), siblings);
      const added = addSubtree(items, node, target);
      return { items: added.items, select: added.id };
    });
  }

  function addGroup(kind: GroupKind) {
    apply(() => {
      const target = insertionTarget(items, selectedId, true);
      const node = newGroupNode(internalVersion, uniqueId(allIds(items), kind === "group" ? "New Group" : "New Dynamic Group"), kind);
      const added = addSubtree(items, node, target);
      return { items: added.items, select: added.id };
    });
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

  const renderNodes = (list: WorkspaceNode[], level: number) =>
    list.map((node) => {
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
            style={{ paddingLeft: 8 + (level - 1) * 16 }}
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
            <span className={styles.kind} aria-hidden>
              {node.items ? (isDynamicGroupDoc(node.aura) ? "⇶" : "▣") : "◆"}
            </span>
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
              <span className={styles.name}>{id}</span>
            )}
            {kind && <span className={styles.badge}>{kind}</span>}
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
                {hidden ? "◌" : "●"}
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
      <div className={styles.toolbar}>
        <button type="button" onClick={addAura}>
          New aura
        </button>
        <button type="button" onClick={() => addGroup("group")}>
          New group
        </button>
        <button type="button" onClick={() => addGroup("dynamicgroup")}>
          New dynamic group
        </button>
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
      </ul>
      {selected && (
        <div className={styles.actions} aria-label="Selected item">
          <button type="button" onClick={() => setRenaming({ id: selectedId!, value: selectedId! })}>
            Rename
          </button>
          <button type="button" onClick={() => apply(() => {
            const d = duplicateNode(items, selectedId!);
            return { items: d.items, select: d.id };
          })}>
            Duplicate
          </button>
          <button type="button" onClick={remove}>
            Delete
          </button>
          <button type="button" aria-label="Move up" title="Move up" onClick={() => apply(() => ({ items: shiftNode(items, selectedId!, -1), select: selectedId }))}>
            ↑
          </button>
          <button type="button" aria-label="Move down" title="Move down" onClick={() => apply(() => ({ items: shiftNode(items, selectedId!, 1), select: selectedId }))}>
            ↓
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
