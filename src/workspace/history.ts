/**
 * Undo/redo history. Pure and immutable.
 *
 * The history doesn't care where a change came from: whatever the page shows next (an edit in the raw table, a spell
 * pick, a pasted code, an agent's push) is `record`ed and becomes one step. Undo and redo only move the cursor; the
 * caller restores the entry at the cursor, and recording that same entry again is a no-op, so going back and forth
 * never adds steps. A new change after an undo drops the redo branch.
 *
 * The page records `{items, selectedId}` by reference: tree nodes are immutable and edits share unchanged subtrees,
 * so a step costs only the nodes it changed.
 */
export interface History<T> {
  readonly entries: readonly T[];
  /** Index of the current entry in `entries`; -1 while empty. */
  readonly index: number;
}

export const EMPTY_HISTORY: History<never> = { entries: [], index: -1 };

/** Steps kept; the oldest fall off. */
const HISTORY_LIMIT = 200;

/** Records the entry now shown. Returns the same history when it is the current entry (by `same`). */
export function record<T>(
  history: History<T>,
  entry: T,
  same: (a: T, b: T) => boolean = Object.is,
  limit = HISTORY_LIMIT,
): History<T> {
  if (history.index >= 0 && same(history.entries[history.index], entry)) return history;
  const entries = [...history.entries.slice(0, history.index + 1), entry];
  const drop = Math.max(0, entries.length - limit);
  return { entries: entries.slice(drop), index: entries.length - 1 - drop };
}

export const canUndo = <T>(h: History<T>) => h.index > 0;
export const canRedo = <T>(h: History<T>) => h.index < h.entries.length - 1;

/** The history with the cursor one step back, or null at the start. */
export function undo<T>(h: History<T>): History<T> | null {
  return canUndo(h) ? { entries: h.entries, index: h.index - 1 } : null;
}

/** The history with the cursor one step forward, or null at the end. */
export function redo<T>(h: History<T>): History<T> | null {
  return canRedo(h) ? { entries: h.entries, index: h.index + 1 } : null;
}

/** The entry at the cursor. */
export function current<T>(h: History<T>): T | null {
  return h.entries[h.index] ?? null;
}
