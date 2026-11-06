"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { DEFAULT_WORKSPACE_ID } from "@/workspace";
import type { UseWorkspace } from "./useWorkspace";
import styles from "./WorkspacePanel.module.css";

/** Paste a state code, save/load the workspace file, and see which workspace agents push to. */
export function WorkspacePanel({ workspace }: { workspace: UseWorkspace }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ name: string; text: string; count: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function paste(action: "load" | "add") {
    const result = action === "load" ? workspace.load(text) : workspace.importCode(text);
    if (result.ok) {
      setText("");
      setError(null);
    } else {
      setError(result.error);
    }
  }

  function exportFile() {
    const json = workspace.exportFile();
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `aura-workspace-${workspace.workspaceId ?? DEFAULT_WORKSPACE_ID}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    const content = await file.text();
    const checked = workspace.checkFile(content);
    if (!checked.ok) {
      setFileError(`Could not read ${file.name}: ${checked.error}`);
      setPendingFile(null);
      return;
    }
    setFileError(null);
    if (workspace.items.length === 0) {
      finishImport(content, "replace");
      return;
    }
    // Something is already here: ask whether to replace it or add the file's items.
    setPendingFile({ name: file.name, text: content, count: checked.items.length });
  }

  function finishImport(content: string, mode: "replace" | "merge") {
    const result = workspace.importFile(content, mode);
    setFileError(result.ok ? null : result.error);
    setPendingFile(null);
  }

  const id = workspace.workspaceId ?? DEFAULT_WORKSPACE_ID;

  return (
    <section className={styles.panel} aria-label="Workspace">
      {workspace.notice && <p className={styles.error}>{workspace.notice}</p>}
      <div className={styles.paste}>
        <textarea
          className={styles.input}
          aria-label="Paste a code to load"
          placeholder="Paste a state code (!WA:2!…)"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className={styles.buttons}>
          <button type="button" className={styles.button} onClick={() => paste("load")} title="Open the code as the whole workspace">
            Load
          </button>
          <button type="button" className={styles.button} onClick={() => paste("add")} title="Add the code's aura or group to the workspace">
            Add to workspace
          </button>
        </div>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          Could not load that state code: {error}
        </p>
      )}
      <div className={styles.file}>
        <button type="button" className={styles.button} onClick={exportFile}>
          Export workspace file
        </button>
        <button type="button" className={styles.button} onClick={() => fileInput.current?.click()}>
          Import workspace file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="Workspace file"
          onChange={(e) => {
            void chooseFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {pendingFile && (
        <div className={styles.confirm} role="dialog" aria-label="Import workspace file">
          <p>
            {pendingFile.name} holds {pendingFile.count} item{pendingFile.count === 1 ? "" : "s"}. Replace this workspace, or add
            them to it?
          </p>
          <div className={styles.buttons}>
            <button type="button" className={styles.button} onClick={() => finishImport(pendingFile.text, "replace")}>
              Replace workspace
            </button>
            <button type="button" className={styles.button} onClick={() => finishImport(pendingFile.text, "merge")}>
              Add items
            </button>
            <button type="button" className={styles.button} onClick={() => setPendingFile(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {fileError && (
        <p className={styles.error} role="alert">
          {fileError}
        </p>
      )}
      <p className={styles.meta}>
        Workspace <code data-testid="workspace-id">{id}</code>. Agents push to{" "}
        <code>POST /api/workspaces/{id}/aura</code> and this page updates live; see{" "}
        <Link href="/docs/agents">agent docs</Link>.
      </p>
    </section>
  );
}
