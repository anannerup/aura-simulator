"use client";

import { useEffect, useState } from "react";
import { searchSpells, type SpellSearchHit } from "./spell-api";
import { errorMessage } from "@/lib/errors";

export interface SpellSearch {
  /** The answer for the current query; null while it is pending, failed, or the search is off. */
  hits: SpellSearchHit[] | null;
  error: string | null;
}

/**
 * Live spell-cache search as the user types: waits `delayMs` after the last keystroke, cancels the previous request,
 * and never shows an answer for an older query. `refresh` repeats the search when it changes (after a sync).
 */
export function useSpellSearch(
  query: string,
  { enabled = true, delayMs = 150, refresh }: { enabled?: boolean; delayMs?: number; refresh?: unknown } = {},
): SpellSearch {
  const q = query.trim();
  const on = enabled && q !== "";
  const [answer, setAnswer] = useState<{ q: string; refresh: unknown } & SpellSearch>();
  useEffect(() => {
    if (!on) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      searchSpells(q, ac.signal).then(
        (r) => setAnswer({ q, refresh, hits: r.results, error: null }),
        (e: unknown) => !ac.signal.aborted && setAnswer({ q, refresh, hits: null, error: errorMessage(e) }),
      );
    }, delayMs);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, on, delayMs, refresh]);
  return on && answer?.q === q && answer.refresh === refresh ? answer : { hits: null, error: null };
}
