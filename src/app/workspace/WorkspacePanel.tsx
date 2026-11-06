"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { TopBarChip } from "@/components/shell";
import { BracesIcon, Button, Callout, ChevronDownIcon, Popover, TextArea, Tooltip, WarningIcon } from "@/components/ui";
import { DEFAULT_WORKSPACE_ID } from "@/workspace";
import type { UseWorkspace } from "./useWorkspace";
import styles from "./WorkspacePanel.module.css";

/** Paste a state code, and save/load the workspace file. */
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
      <div className={styles.group}>
        <h3 className={styles.heading}>Paste a state code</h3>
        <TextArea
          mono
          aria-label="Paste a code to load"
          placeholder="!WA:2!…"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className={styles.buttons}>
          <Button size="sm" variant="primary" onClick={() => paste("load")} title="Open the code as the whole workspace">
            Load
          </Button>
          <Button size="sm" onClick={() => paste("add")} title="Add the code's aura or group to the workspace">
            Add to workspace
          </Button>
        </div>
        {error && (
          <Callout tone="danger" icon={<WarningIcon size={14} />} role="alert">
            Could not load that state code: {error}
          </Callout>
        )}
      </div>

      <div className={styles.group}>
        <h3 className={styles.heading}>Workspace file</h3>
        <p className={styles.meta}>Every aura and group in this workspace, as one JSON file.</p>
        <div className={styles.buttons}>
          <Button size="sm" onClick={exportFile}>
            Export workspace file
          </Button>
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            Import workspace file
          </Button>
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
              {pendingFile.name} holds {pendingFile.count} item{pendingFile.count === 1 ? "" : "s"}. Replace this workspace, or
              add them to it?
            </p>
            <div className={styles.buttons}>
              <Button size="sm" variant="primary" onClick={() => finishImport(pendingFile.text, "replace")}>
                Replace workspace
              </Button>
              <Button size="sm" onClick={() => finishImport(pendingFile.text, "merge")}>
                Add items
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPendingFile(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {fileError && (
          <Callout tone="danger" icon={<WarningIcon size={14} />} role="alert">
            {fileError}
          </Callout>
        )}
      </div>

      <p className={styles.meta}>
        Agents push to <code>POST /api/workspaces/{id}/aura</code> and this page updates live; see the{" "}
        <Link href="/docs/agents">agent docs</Link>.
      </p>
    </section>
  );
}

/** The paste/import/export panel as a top-bar menu. */
export function WorkspaceMenu({ workspace }: { workspace: UseWorkspace }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Import and export"
      align="end"
      trigger={(props) => (
        <Button {...props} variant="secondary" className={styles.menuButton} icon={<BracesIcon size={14} />}>
          <span className={styles.menuLabel}>Import / Export</span>
          <ChevronDownIcon size={14} />
        </Button>
      )}
    >
      <WorkspacePanel workspace={workspace} />
    </Popover>
  );
}

/** A notice about the restore (e.g. a broken link), for above the stage. */
export function WorkspaceNotice({ workspace }: { workspace: UseWorkspace }) {
  if (!workspace.notice) return null;
  return (
    <Callout tone="warn" icon={<WarningIcon size={14} />}>
      {workspace.notice}
    </Callout>
  );
}

/** The workspace the page follows, for the top bar. Agents push to it and this page updates live. */
export function WorkspaceBadge({ workspace }: { workspace: UseWorkspace }) {
  const id = workspace.workspaceId ?? DEFAULT_WORKSPACE_ID;
  return (
    <Tooltip content={`Agents push to POST /api/workspaces/${id}/aura; this page updates live`} side="bottom">
      <TopBarChip label="Workspace" tabIndex={0}>
        <code data-testid="workspace-id">{id}</code>
      </TopBarChip>
    </Tooltip>
  );
}
