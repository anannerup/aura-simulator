"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuraCore, AuraDocument } from "@/core";
import type { WorkspaceNode } from "@/workspace";
import {
  EMPTY_VIEW,
  WorkspaceSession,
  type ExportedFile,
  type ImportFilesResult,
  type LoadResult,
  type WorkspaceView,
} from "./session";

export type { ImportFilesResult, PendingWorkspaceFile } from "./session";

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
  /** The state code of an item (aura or group with everything in it); the selected one by default. */
  codeOf(id?: string | null): string | null;
  /** Copies an item's state code to the clipboard (the game's import box needs a paste); the selected by default. */
  copyCode(id?: string | null): Promise<LoadResult>;
  /** Downloads an item's import string as `<aura name>.txt` (UTF-8, exactly the `!WA:2!` string); selected by default. */
  exportAura(id?: string | null): LoadResult;
  /** Downloads the workspace file (JSON, format v2) as `.json`. */
  exportWorkspace(): LoadResult;
  /**
   * Imports dropped or picked files: text with one or more `!WA:` strings adds each to the workspace; a workspace
   * `.json` replaces an empty workspace, else comes back in `pending` for a replace/merge choice (`importFile`).
   */
  importFiles(files: ArrayLike<File> | Iterable<File>): Promise<ImportFilesResult>;
  /** The workspace file (JSON, format v2) as text. */
  exportFile(): string;
  checkFile(text: string): FileCheck;
  /** Applies a workspace file: replace the workspace, or add its items. */
  importFile(text: string, mode: "replace" | "merge"): LoadResult;
}

const NOT_READY = { ok: false, error: "Still loading" } as const;

/** Saves text as a file through a temporary link. */
function download(file: ExportedFile) {
  const url = URL.createObjectURL(new Blob([file.text], { type: file.type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The page's workspace, once an aura core is loaded. `fallbackCode` is shown when neither browser storage nor
 * the server has a state. A new core (another addon version) restarts the session, which restores the same
 * workspace from browser storage.
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
  const codeOf = useCallback((id?: string | null) => session.current?.codeOfItem(id ?? undefined) ?? null, []);
  const copyCode = useCallback(async (id?: string | null): Promise<LoadResult> => {
    const code = session.current?.codeOfItem(id ?? undefined);
    if (!code) return { ok: false, error: "Nothing to copy" };
    try {
      await navigator.clipboard.writeText(code);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Could not copy: ${e instanceof Error ? e.message : String(e)}` };
    }
  }, []);
  const exportAura = useCallback((id?: string | null): LoadResult => {
    const file = session.current?.auraFile(id ?? undefined);
    if (!file) return { ok: false, error: "Nothing to export" };
    download(file);
    return { ok: true };
  }, []);
  const exportWorkspace = useCallback((): LoadResult => {
    if (!session.current) return NOT_READY;
    download(session.current.workspaceFile());
    return { ok: true };
  }, []);
  const importFiles = useCallback(
    async (files: ArrayLike<File> | Iterable<File>): Promise<ImportFilesResult> =>
      session.current?.importFiles(files) ?? { added: [], errors: [NOT_READY.error], pending: [] },
    [],
  );
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
      codeOf,
      copyCode,
      exportAura,
      exportWorkspace,
      importFiles,
      exportFile,
      checkFile,
      importFile,
    }),
    [view, load, importCode, setItems, select, updateSelected, codeOf, copyCode, exportAura, exportWorkspace, importFiles, exportFile, checkFile, importFile],
  );
}
