"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuraCore, AuraDocument } from "@/core";
import type { WorkspaceNode } from "@/workspace";
import { EMPTY_VIEW, WorkspaceSession, type LoadResult, type WorkspaceView } from "./session";

export type FileCheck = { ok: true; items: WorkspaceNode[]; selected: string | null } | { ok: false; error: string };

export interface UseWorkspace extends WorkspaceView {
  /** The selected item's document (same as `aura`). */
  selected: AuraDocument | null;
  /** Opens a pasted state code as the whole workspace; on failure nothing changes and the error says why. */
  load(code: string): LoadResult;
  /** Adds a pasted state code (aura or group subtree) to the top level and selects it. */
  importCode(code: string): LoadResult;
  /** Replaces the tree after a tree edit, selecting `selectedId`. */
  setItems(items: WorkspaceNode[], selectedId: string | null): LoadResult;
  select(id: string): void;
  /** Replaces the selected item's document (editors, spell picker). A changed `id` is a rename. */
  updateSelected(doc: AuraDocument): LoadResult;
  /** The workspace file (JSON, format v2). */
  exportFile(): string;
  checkFile(text: string): FileCheck;
  importFile(text: string, mode: "replace" | "merge"): LoadResult;
}

const NOT_READY = { ok: false, error: "Still loading" } as const;

/**
 * The page's workspace, once an aura core is loaded. `fallbackCode` is shown when neither the address,
 * browser storage nor the server has a state. A new core (another addon version) restarts the session,
 * which restores the same workspace from the address.
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

  const load = useCallback((code: string) => session.current?.load(code) ?? NOT_READY, []);
  const importCode = useCallback((code: string) => session.current?.importCode(code) ?? NOT_READY, []);
  const setItems = useCallback(
    (items: WorkspaceNode[], selectedId: string | null) => session.current?.setItems(items, selectedId) ?? NOT_READY,
    [],
  );
  const select = useCallback((id: string) => session.current?.select(id), []);
  const updateSelected = useCallback((doc: AuraDocument) => session.current?.updateSelected(doc) ?? NOT_READY, []);
  const exportFile = useCallback(() => session.current?.exportFile() ?? "", []);
  const checkFile = useCallback((text: string): FileCheck => session.current?.checkFile(text) ?? NOT_READY, []);
  const importFile = useCallback(
    (text: string, mode: "replace" | "merge") => session.current?.importFile(text, mode) ?? NOT_READY,
    [],
  );

  return useMemo(
    () => ({
      ...view,
      selected: view.aura,
      load,
      importCode,
      setItems,
      select,
      updateSelected,
      exportFile,
      checkFile,
      importFile,
    }),
    [view, load, importCode, setItems, select, updateSelected, exportFile, checkFile, importFile],
  );
}
