"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuraCore } from "@/core";
import { EMPTY_VIEW, WorkspaceSession, type LoadResult, type WorkspaceView } from "./session";

export interface UseWorkspace extends WorkspaceView {
  /** Loads a pasted state code; on failure nothing changes and the error says why. */
  load(code: string): LoadResult;
}

/**
 * The page's workspace, once an aura core is loaded. `fallbackCode` is shown when neither the address,
 * browser storage nor the server has a state. A new core (another addon version) restarts the session,
 * which restores the same state code from the address.
 */
export function useWorkspace(core: AuraCore | null, fallbackCode: string | null): UseWorkspace {
  const [view, setView] = useState<WorkspaceView>(EMPTY_VIEW);
  const session = useRef<WorkspaceSession | null>(null);

  useEffect(() => {
    if (!core || !fallbackCode) return;
    const s = new WorkspaceSession(core, setView);
    session.current = s;
    void s.start(fallbackCode);
    return () => {
      s.dispose();
      if (session.current === s) session.current = null;
    };
  }, [core, fallbackCode]);

  const load = useCallback(
    (code: string): LoadResult => session.current?.load(code) ?? { ok: false, error: "Still loading" },
    [],
  );

  return { ...view, load };
}
