"use client";

import { useCallback, useEffect, useState } from "react";
import { EMPTY_HISTORY, canRedo, canUndo, current, record, redo, undo, type History, type WorkspaceNode } from "@/workspace";
import type { EditResult } from "./session";

export interface UseUndo {
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
}

/** One undo step: the tree and the selection, held by reference (nodes are immutable and share unchanged subtrees). */
interface Step {
  items: WorkspaceNode[];
  selectedId: string | null;
}

const sameStep = (a: Step, b: Step) => a.items === b.items && a.selectedId === b.selectedId;

/** Whether a key event belongs to a text field, which has its own undo. */
function isTextEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset"].includes(target.type);
  }
  return false;
}

/**
 * Undo/redo over the workspace (tree and selection). Every state the page shows becomes a step, whatever made it
 * (editors, tree, paste, agent push), so this covers all edit sources without them knowing. Undo/redo restore the
 * earlier tree through `restore`, so storage and server follow. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y work anywhere
 * on the page except inside text fields.
 */
export function useUndo(
  items: WorkspaceNode[],
  selectedId: string | null,
  restore: (items: WorkspaceNode[], selectedId: string | null) => EditResult,
): UseUndo {
  const [history, setHistory] = useState<History<Step>>(EMPTY_HISTORY);
  const shown = current(history);
  if (items.length && !(shown && sameStep(shown, { items, selectedId }))) {
    setHistory((h) => record(h, { items, selectedId }, sameStep));
  }

  const go = useCallback(
    (move: (h: History<Step>) => History<Step> | null) => {
      const next = move(history);
      const step = next && current(next);
      if (!step) return;
      // Move first, so the restored state is already the current step when the page shows it.
      setHistory(next);
      if (!restore(step.items, step.selectedId).ok) setHistory(history);
    },
    [history, restore],
  );
  const doUndo = useCallback(() => go(undo), [go]);
  const doRedo = useCallback(() => go(redo), [go]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || isTextEditing(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) doUndo();
      else if ((key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey)) doRedo();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  return { canUndo: canUndo(history), canRedo: canRedo(history), undo: doUndo, redo: doRedo };
}
