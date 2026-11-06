"use client";

import Link from "next/link";
import { useState } from "react";
import { DEFAULT_WORKSPACE_ID } from "@/workspace";
import type { UseWorkspace } from "./useWorkspace";
import styles from "./WorkspacePanel.module.css";

/** Paste a state code, and see which workspace agents push to. */
export function WorkspacePanel({ workspace }: { workspace: UseWorkspace }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    const result = workspace.load(text);
    if (result.ok) {
      setText("");
      setError(null);
    } else {
      setError(result.error);
    }
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
        <button type="button" className={styles.button} onClick={load}>
          Load
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          Could not load that state code: {error}
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
