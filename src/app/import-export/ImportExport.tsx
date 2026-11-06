"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Callout, TextArea, useToast, WarningIcon } from "@/components/ui";
import { DEFAULT_WORKSPACE_ID } from "@/workspace";
import type { UseWorkspace } from "../workspace/useWorkspace";
import styles from "./ImportExport.module.css";

/** Pasted strings up to this size go through the paste box; anything bigger should be a file. */
const PASTE_HINT_LIMIT = 200_000;

type PendingFile = { name: string; text: string; count: number };

/**
 * Import state: a pasted state code (Load replaces the workspace, Add puts it beside what's there), or a file —
 * a workspace file (asks to replace or merge when the workspace isn't empty) or a text file holding a state code.
 * The UI is `ImportPanel`; the shell's drop handler calls `importFiles` too.
 */
export function useImporter(workspace: UseWorkspace) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);

  function paste(action: "load" | "add") {
    const result = action === "load" ? workspace.load(text) : workspace.importCode(text);
    if (result.ok) {
      setText("");
      setError(null);
    } else {
      setError(result.error);
    }
  }

  function finishImport(content: string, mode: "replace" | "merge") {
    const result = workspace.importFile(content, mode);
    setFileError(result.ok ? null : result.error);
    setPendingFile(null);
  }

  async function importFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    const content = await file.text();
    // A text file with a state code in it: add it to the workspace.
    if (/^\s*!WA:/.test(content)) {
      const result = workspace.importCode(content.trim());
      setFileError(result.ok ? null : `Could not read ${file.name}: ${result.error}`);
      setPendingFile(null);
      return;
    }
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

  return {
    text,
    setText,
    error,
    paste,
    fileError,
    pendingFile,
    importFiles,
    finishImport,
    cancelImport: () => setPendingFile(null),
  };
}

export type Importer = ReturnType<typeof useImporter>;

/** The Import dialog: choose or drop a file, or paste a (small) state code. */
export function ImportPanel({ importer }: { importer: Importer }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { pendingFile } = importer;
  return (
    <section className={styles.panel} aria-label="Workspace">
      <h2 className={styles.title}>Import</h2>
      <div className={styles.dropZone}>
        <p>Drop a workspace file (.json) or a state code file anywhere on the window, or</p>
        <Button onClick={() => fileInput.current?.click()}>Choose file…</Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json,text/plain,.txt"
          hidden
          aria-label="Workspace file"
          onChange={(e) => {
            void importer.importFiles(Array.from(e.target.files ?? []));
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
            <Button size="sm" onClick={() => importer.finishImport(pendingFile.text, "replace")}>
              Replace workspace
            </Button>
            <Button size="sm" onClick={() => importer.finishImport(pendingFile.text, "merge")}>
              Add items
            </Button>
            <Button size="sm" variant="ghost" onClick={importer.cancelImport}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {importer.fileError && (
        <Callout tone="danger" icon={<WarningIcon size={14} />} role="alert">
          {importer.fileError}
        </Callout>
      )}

      <h3 className={styles.subTitle}>Or paste a short state code</h3>
      <TextArea
        mono
        aria-label="Paste a code to load"
        placeholder="!WA:2!…"
        rows={3}
        value={importer.text}
        onChange={(e) => importer.setText(e.target.value)}
      />
      {importer.text.length > PASTE_HINT_LIMIT && (
        <p className={styles.hint}>That is a long code; saving it as a file and importing the file is easier.</p>
      )}
      <div className={styles.buttons}>
        <Button size="sm" onClick={() => importer.paste("load")} title="Open the code as the whole workspace">
          Load
        </Button>
        <Button size="sm" onClick={() => importer.paste("add")} title="Add the code's aura or group to the workspace">
          Add to workspace
        </Button>
      </div>
      {importer.error && (
        <Callout tone="danger" icon={<WarningIcon size={14} />} role="alert">
          Could not load that state code: {importer.error}
        </Callout>
      )}
    </section>
  );
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileSafe = (name: string) => name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "aura";

/**
 * The Export dialog for the selected aura or group: save its state code as a file, or copy it to paste into the
 * game's import box. Also exports the whole workspace as a file.
 */
export function ExportPanel({ workspace }: { workspace: UseWorkspace }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const code = workspace.code ?? "";
  const name = workspace.selectedId;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      toast("The browser blocked the clipboard; save the file instead", { tone: "danger" });
      return;
    }
    setCopied(true);
    toast("Copied; paste it into the game's Import box");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }, [code, toast]);

  const kb = (code.length / 1024).toFixed(code.length < 10240 ? 1 : 0);
  return (
    <section className={styles.panel} aria-label="Export">
      <h2 className={styles.title}>State code{name ? ` of ${name}` : ""}</h2>
      <p className={styles.hint}>
        {name ? `${kb} KB. ` : "Select an aura or group first. "}In the game, open Musca Auras, click Import, and paste it.
      </p>
      {/* Kept for agents and tests that read the code; not shown. */}
      <textarea className={styles.hiddenCode} readOnly value={code} aria-label="State code" tabIndex={-1} />
      <div className={styles.buttons}>
        <Button disabled={!code} onClick={() => download(`${fileSafe(name ?? "aura")}.txt`, code, "text/plain")}>
          Save as file
        </Button>
        <Button disabled={!code} onClick={copy}>
          {copied ? "Copied" : "Copy to clipboard"}
        </Button>
      </div>
      <h3 className={styles.subTitle}>Whole workspace</h3>
      <div className={styles.buttons}>
        <Button
          size="sm"
          onClick={() =>
            download(`aura-workspace-${workspace.workspaceId ?? DEFAULT_WORKSPACE_ID}.json`, workspace.exportFile(), "application/json")
          }
        >
          Export workspace file
        </Button>
      </div>
    </section>
  );
}
