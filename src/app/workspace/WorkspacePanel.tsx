"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { DEFAULT_WORKSPACE_ID } from "@/workspace";
import { useFileDrop } from "./useFileDrop";
import type { PendingWorkspaceFile, UseWorkspace } from "./useWorkspace";
import styles from "./WorkspacePanel.module.css";

/**
 * Fallback workspace UI: paste a state code, export the selected aura or the workspace as a file, import files
 * (picked or dropped anywhere on the page), and see which workspace agents push to.
 */
export function WorkspacePanel({ workspace }: { workspace: UseWorkspace }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingWorkspaceFile[]>([]);
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

  const { importFiles } = workspace;
  const chooseFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const result = await importFiles(files);
      setFileErrors(result.errors);
      setPending((p) => [...p, ...result.pending]);
    },
    [importFiles],
  );
  const dragging = useFileDrop(chooseFiles);

  function finishImport(file: PendingWorkspaceFile, mode: "replace" | "merge" | "cancel") {
    if (mode !== "cancel") {
      const result = workspace.importFile(file.text, mode);
      setFileErrors(result.ok ? [] : [`Could not read ${file.name}: ${result.error}`]);
    }
    setPending((p) => p.filter((x) => x !== file));
  }

  const id = workspace.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const next = pending[0];

  return (
    <section className={styles.panel} aria-label="Workspace">
      {workspace.notice && <p className={styles.error}>{workspace.notice}</p>}
      {workspace.warning && (
        <p className={styles.error} role="status">
          {workspace.warning}
        </p>
      )}
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
        <button
          type="button"
          className={styles.button}
          onClick={() => workspace.exportAura()}
          disabled={!workspace.selectedId}
          title="Save the selected aura's import string as a .txt file"
        >
          Export aura file
        </button>
        <button type="button" className={styles.button} onClick={() => workspace.exportWorkspace()}>
          Export workspace file
        </button>
        <button type="button" className={styles.button} onClick={() => fileInput.current?.click()} title="Aura .txt files or a workspace .json; you can also drop them on the page">
          Import files
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.json,text/plain,application/json"
          multiple
          hidden
          aria-label="Import files"
          onChange={(e) => {
            void chooseFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {dragging && <p className={styles.meta}>Drop aura .txt or workspace .json files to import them.</p>}
      {next && (
        <div className={styles.confirm} role="dialog" aria-label="Import workspace file">
          <p>
            {next.name} holds {next.count} item{next.count === 1 ? "" : "s"}. Replace this workspace, or add them to it?
          </p>
          <div className={styles.buttons}>
            <button type="button" className={styles.button} onClick={() => finishImport(next, "replace")}>
              Replace workspace
            </button>
            <button type="button" className={styles.button} onClick={() => finishImport(next, "merge")}>
              Add items
            </button>
            <button type="button" className={styles.button} onClick={() => finishImport(next, "cancel")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {fileErrors.map((message) => (
        <p key={message} className={styles.error} role="alert">
          {message}
        </p>
      ))}
      <p className={styles.meta}>
        Workspace <code data-testid="workspace-id">{id}</code>. Agents push to{" "}
        <code>POST /api/workspaces/{id}/aura</code> and this page updates live; see{" "}
        <Link href="/docs/agents">agent docs</Link>.
      </p>
    </section>
  );
}
