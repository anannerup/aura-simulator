"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NOT_READY, type ExportedFile, type PendingWorkspaceFile, type WorkspaceSession } from "@/client/workspace/session";
import { Button, Callout, TextArea, useToast, WarningIcon } from "@/components/ui";
import styles from "./ImportExport.module.css";

/** Pasted strings up to this size go through the paste box; anything bigger should be a file. */
const PASTE_HINT_LIMIT = 200_000;

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
 * Import state: a pasted state code (Load replaces the workspace, Add puts it beside what's there), or files —
 * text files with state codes are added; a workspace file replaces an empty workspace, else it waits in
 * `pendingFile` for the player to choose replace or merge. The UI is `ImportPanel`; the shell's drop handler
 * calls `importFiles` too.
 */
export function useImporter(session: WorkspaceSession | null) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingWorkspaceFile[]>([]);

  function paste(action: "load" | "add") {
    const result = !session ? NOT_READY : action === "load" ? session.openCode(text) : session.addCode(text);
    if (result.ok) {
      setText("");
      setError(null);
    } else {
      setError(result.error);
    }
  }

  const importFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      if (!session) return setFileErrors([NOT_READY.error]);
      const result = await session.importFiles(files);
      setFileErrors(result.errors);
      setPending((p) => [...p, ...result.pending]);
    },
    [session],
  );

  function finishImport(file: PendingWorkspaceFile, mode: "replace" | "merge" | "cancel") {
    if (mode !== "cancel") {
      const result = session ? session.applyWorkspaceFile(file, mode) : NOT_READY;
      setFileErrors(result.ok ? [] : [`Could not read ${file.name}: ${result.error}`]);
    }
    setPending((p) => p.filter((x) => x !== file));
  }

  return {
    text,
    setText,
    error,
    paste,
    fileErrors,
    /** The next workspace file waiting for a replace/merge choice. */
    pendingFile: pending[0] ?? null,
    importFiles,
    finishImport,
  };
}

export type Importer = ReturnType<typeof useImporter>;

/** The Import dialog: choose or drop a file, or paste a (small) state code. */
export function ImportPanel({ importer }: { importer: Importer }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { pendingFile } = importer;
  const count = pendingFile?.workspace.items.length ?? 0;
  return (
    <section className={styles.panel} aria-label="Workspace">
      <h2 className={styles.title}>Import</h2>
      <div className={styles.dropZone}>
        <p>Drop state code files (.txt) or a workspace file (.json) anywhere on the window, or</p>
        <Button onClick={() => fileInput.current?.click()}>Choose file…</Button>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.json,text/plain,application/json"
          multiple
          hidden
          aria-label="Import files"
          onChange={(e) => {
            void importer.importFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {pendingFile && (
        <div className={styles.confirm} role="dialog" aria-label="Import workspace file">
          <p>
            {pendingFile.name} holds {count} item{count === 1 ? "" : "s"}. Replace this workspace, or add them to it?
          </p>
          <div className={styles.buttons}>
            <Button size="sm" onClick={() => importer.finishImport(pendingFile, "replace")}>
              Replace workspace
            </Button>
            <Button size="sm" onClick={() => importer.finishImport(pendingFile, "merge")}>
              Add items
            </Button>
            <Button size="sm" variant="ghost" onClick={() => importer.finishImport(pendingFile, "cancel")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {importer.fileErrors.map((message) => (
        <Callout key={message} tone="danger" icon={<WarningIcon size={14} />} role="alert">
          {message}
        </Callout>
      ))}

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

/**
 * The Export dialog for the selected aura or group (`name`, state code `code`): save it as a file, or copy it to
 * paste into the game's import box. Also exports the whole workspace as a file.
 */
export function ExportPanel({ session, name, code }: { session: WorkspaceSession; name: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

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
      <h2 className={styles.title}>State code of {name}</h2>
      <p className={styles.hint}>{kb} KB. In the game, open Musca Auras, click Import, and paste it.</p>
      <div className={styles.buttons}>
        <Button
          onClick={() => {
            const file = session.auraFile(name);
            if (file) download(file);
          }}
        >
          Save as file
        </Button>
        <Button onClick={copy}>{copied ? "Copied" : "Copy to clipboard"}</Button>
      </div>
      <h3 className={styles.subTitle}>Whole workspace</h3>
      <div className={styles.buttons}>
        <Button size="sm" onClick={() => download(session.workspaceFile())}>
          Export workspace file
        </Button>
      </div>
    </section>
  );
}
