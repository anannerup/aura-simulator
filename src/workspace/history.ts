/**
 * Undo/redo history of a workspace's state codes. Pure and immutable.
 *
 * The history doesn't care where a change came from: whatever the page shows next (an edit in the raw
 * table, a spell pick, a pasted code, an agent's push) is `record`ed and becomes one step. Undo and redo
 * only move the cursor; the caller loads the code at the cursor, and recording that same code again is a
 * no-op, so going back and forth never adds steps. A new change after an undo drops the redo branch.
 */
export interface History {
  readonly entries: readonly string[];
  /** Index of the current code in `entries`; -1 while empty. */
  readonly index: number;
}

export const EMPTY_HISTORY: History = { entries: [], index: -1 };

/** Steps kept; the oldest fall off. */
export const HISTORY_LIMIT = 200;

/** Records the code now shown. Returns the same history when it's the current code. */
export function record(history: History, code: string, limit = HISTORY_LIMIT): History {
  if (history.entries[history.index] === code) return history;
  const entries = [...history.entries.slice(0, history.index + 1), code];
  const drop = Math.max(0, entries.length - limit);
  return { entries: entries.slice(drop), index: entries.length - 1 - drop };
}

export const canUndo = (h: History) => h.index > 0;
export const canRedo = (h: History) => h.index < h.entries.length - 1;

/** The history with the cursor one step back, or null at the start. */
export function undo(h: History): History | null {
  return canUndo(h) ? { entries: h.entries, index: h.index - 1 } : null;
}

/** The history with the cursor one step forward, or null at the end. */
export function redo(h: History): History | null {
  return canRedo(h) ? { entries: h.entries, index: h.index + 1 } : null;
}

/** The code at the cursor. */
export function current(h: History): string | null {
  return h.entries[h.index] ?? null;
}
