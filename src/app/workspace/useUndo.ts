"use client";

import { useCallback, useEffect, useState } from "react";
import { EMPTY_HISTORY, canRedo, canUndo, current, record, redo, undo, type History } from "@/workspace/history";
import type { LoadResult } from "./session";

export interface UseUndo {
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
}

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
 * Undo/redo over the workspace's state codes. Every code the page shows becomes a step, whatever made it
 * (raw editor, spell picker, paste, agent push), so this covers all edit sources without them knowing.
 * Undo/redo load the earlier code through the workspace, so address, storage and server follow.
 * Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y work anywhere on the page except inside text fields.
 */
export function useUndo(code: string | null, load: (code: string) => LoadResult): UseUndo {
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);
  const [seen, setSeen] = useState<string | null>(null);
  if (code !== null && code !== seen) {
    setSeen(code);
    setHistory((h) => record(h, code));
  }

  const go = useCallback(
    (move: (h: History) => History | null) => {
      const next = move(history);
      if (!next) return;
      if (load(current(next)!).ok) setHistory(next);
    },
    [history, load],
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
