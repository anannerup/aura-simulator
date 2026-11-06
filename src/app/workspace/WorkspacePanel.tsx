"use client";

import Link from "next/link";
import { useState } from "react";
import { TopBarChip } from "@/components/shell";
import { Button, Callout, TextArea, Tooltip, WarningIcon } from "@/components/ui";
import { DEFAULT_WORKSPACE_ID } from "@/workspace";
import type { UseWorkspace } from "./useWorkspace";
import styles from "./WorkspacePanel.module.css";

/** Paste a state code to load it. */
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
      {workspace.notice && (
        <Callout tone="warn" icon={<WarningIcon size={14} />}>
          {workspace.notice}
        </Callout>
      )}
      <TextArea
        mono
        aria-label="Paste a code to load"
        placeholder="Paste a state code (!WA:2!…)"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={styles.actions}>
        <span className={styles.meta}>
          Or let an agent push to <code title={`POST /api/workspaces/${id}/aura`}>{id}</code>; see the{" "}
          <Link href="/docs/agents">agent docs</Link>.
        </span>
        <Button size="sm" onClick={load}>
          Load
        </Button>
      </div>
      {error && (
        <Callout tone="danger" icon={<WarningIcon size={14} />} role="alert">
          Could not load that state code: {error}
        </Callout>
      )}
    </section>
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
