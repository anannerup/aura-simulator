"use client";

import { useState, type ReactNode } from "react";
import { iconNameUrl } from "@/render/textures";
import { addSubtree, allIds, findNode, insertionTarget, newAuraNode, newGroupNode, uniqueId, type WorkspaceNode } from "@/workspace";
import styles from "./NewAuraChooser.module.css";

type Kind = "icon" | "group" | "dynamicgroup";

interface Entry {
  kind: Kind | null;
  name: string;
  description: string;
  thumb: ReactNode;
}

const ADVANCED: Entry[] = [
  {
    kind: "group",
    name: "Group",
    description: "Controls the positioning and configuration of multiple displays at the same time",
    thumb: (
      <span className={styles.thumbGroup} aria-hidden>
        <i />
        <i />
        <i />
      </span>
    ),
  },
  {
    kind: "dynamicgroup",
    name: "Dynamic Group",
    description: "A group that dynamically controls the positioning of its children",
    thumb: (
      <span className={styles.thumbDynamic} aria-hidden>
        <i />
        <i />
      </span>
    ),
  },
  {
    kind: "icon",
    name: "Icon",
    description: "Shows a spell icon with an optional cooldown overlay",
    // eslint-disable-next-line @next/next/no-img-element -- Wowhead image server, loaded at runtime
    thumb: <img className={styles.thumbImg} src={iconNameUrl("spell_holy_magicalsentry", "medium")} alt="" />,
  },
  { kind: null, name: "Progress Bar", description: "Shows a progress bar with name, timer, and icon", thumb: <span className={styles.thumbBar} aria-hidden /> },
  { kind: null, name: "Progress Texture", description: "Shows a texture that changes based on duration", thumb: <span className={styles.thumbEmpty} aria-hidden /> },
  { kind: null, name: "Text", description: "Shows one or more lines of text, which can include dynamic information such as progress or stacks", thumb: <span className={styles.thumbText} aria-hidden>Text</span> },
  { kind: null, name: "Texture", description: "Shows a custom texture", thumb: <span className={styles.thumbEmpty} aria-hidden /> },
];

export interface NewAuraChooserProps {
  items: WorkspaceNode[];
  selectedId: string | null;
  internalVersion: number;
  /** The tree with the new item, and its id to select. */
  onCreate(items: WorkspaceNode[], selectedId: string): void;
  onCancel(): void;
}

/**
 * The window's New Aura page: display types with a thumbnail, gold name and description, as in game. New items go
 * where the tree's own buttons put them (into a selected group, else after the selection). Types the simulator
 * can't create yet are shown dimmed.
 */
export function NewAuraChooser({ items, selectedId, internalVersion, onCreate, onCancel }: NewAuraChooserProps) {
  const [error, setError] = useState<string | null>(null);

  function create(kind: Kind) {
    try {
      const isGroup = kind !== "icon";
      const target = insertionTarget(items, selectedId, isGroup);
      const taken = allIds(items);
      const node = isGroup
        ? newGroupNode(internalVersion, uniqueId(taken, kind === "group" ? "New Group" : "New Dynamic Group"), kind)
        : newAuraNode(internalVersion, uniqueId(taken, "New"), target.parentId ? (findNode(items, target.parentId)?.node.items?.length ?? 0) : 0);
      const added = addSubtree(items, node, target);
      onCreate(added.items, added.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className={styles.chooser} aria-label="New aura">
      <div className={styles.scroll}>
        <h2 className={styles.heading}>Advanced</h2>
        <ul className={styles.list}>
          {ADVANCED.map((e) => (
            <li key={e.name}>
              <button
                type="button"
                className={styles.entry}
                disabled={!e.kind}
                title={e.kind ? undefined : "The simulator can't create this type yet; push or import one instead."}
                onClick={() => e.kind && create(e.kind)}
              >
                <span className={styles.thumb}>{e.thumb}</span>
                <span className={styles.text}>
                  <span className={styles.name}>{e.name}</span>
                  <span className={styles.description}>{e.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
