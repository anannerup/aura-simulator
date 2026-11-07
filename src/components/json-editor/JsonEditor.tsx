"use client";

import { useDeferredValue, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import { Button } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { highlightJson } from "./highlight";
import styles from "./JsonEditor.module.css";

export type ApplyResult = { ok: true; json: string } | { ok: false; error: string };

export interface JsonEditorProps {
  /** The aura's JSON as it is now. When it changes (paste, push, another editor) the text follows, unless it has unapplied edits. */
  value: string;
  /** Applies the edited text; answers with the JSON as it then is (shown in place of the text), or why not (the text is kept). */
  onApply(text: string): ApplyResult;
  /** The section's accessible name; the text area's is "<label> text". */
  label?: string;
}

interface SyntaxError {
  message: string;
  line: number | null;
}

/** The line a `JSON.parse` error points at (engines say "position N" or "line L column C"). */
function errorLine(text: string, message: string): number | null {
  const line = /line (\d+)/.exec(message);
  if (line) return Number(line[1]);
  const position = /position (\d+)/.exec(message);
  if (position) return text.slice(0, Number(position[1])).split("\n").length;
  return null;
}

/** Whether the text is JSON at all; the full check (wago's rules, the addon's import) is on Apply. */
function checkSyntax(text: string): SyntaxError | null {
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    const message = errorMessage(e);
    return { message: `Not JSON: ${message}`, line: errorLine(text, message) };
  }
}

/**
 * Editable JSON of the selected aura with syntax colours and line numbers. Edits apply on Apply or Ctrl/Cmd+Enter;
 * until then the preview keeps the last applied aura. Text that isn't JSON, or that `onApply` refuses, shows the
 * reason and is never thrown away.
 */
export function JsonEditor({ value, onApply, label = "JSON" }: JsonEditorProps) {
  const [text, setText] = useState(value);
  /** The value the text last showed; text differing from it has unapplied edits. */
  const [synced, setSynced] = useState(value);
  const [seen, setSeen] = useState(value);
  const [conflict, setConflict] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // The aura changed (elsewhere, or another one was selected): follow it unless that would throw away edits.
  if (value !== seen) {
    setSeen(value);
    if (text === synced) {
      setText(value);
      setSynced(value);
      setConflict(false);
      setApplyError(null);
    } else {
      setConflict(true);
    }
  }

  const dirty = text !== synced;
  const deferredText = useDeferredValue(text);
  const syntax = useMemo(() => (deferredText === synced ? null : checkSyntax(deferredText)), [deferredText, synced]);

  function apply() {
    const bad = checkSyntax(text);
    if (bad) return setApplyError(bad.message);
    const result = onApply(text);
    if (!result.ok) return setApplyError(result.error);
    setApplyError(null);
    setConflict(false);
    setText(result.json);
    setSynced(result.json);
    setSeen(result.json);
  }

  function reload() {
    setText(value);
    setSynced(value);
    setConflict(false);
    setApplyError(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      apply();
    }
  }

  // Keep the colored layer and line numbers aligned with the textarea's scroll position.
  const layer = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  function onScroll(e: UIEvent<HTMLTextAreaElement>) {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (layer.current) {
      layer.current.scrollTop = scrollTop;
      layer.current.scrollLeft = scrollLeft;
    }
    if (gutter.current) gutter.current.scrollTop = scrollTop;
  }

  const spans = useMemo(() => highlightJson(text), [text]);
  const lineCount = useMemo(() => text.split("\n").length, [text]);
  const shownError = applyError ?? syntax?.message;

  return (
    <section className={styles.editor} aria-label={label} data-testid="json-editor">
      <div className={styles.toolbar}>
        <span className={styles.state} data-testid="json-editor-state" data-dirty={dirty}>
          {dirty ? "Unapplied edits" : "In sync"}
        </span>
        <Button size="sm" variant="ghost" onClick={reload} disabled={!dirty}>
          Revert
        </Button>
        <Button size="sm" variant="primary" onClick={apply} disabled={!dirty} title="Ctrl/Cmd+Enter">
          Apply
        </Button>
      </div>
      {conflict && (
        <div className={styles.conflict} role="status">
          <span>The aura changed elsewhere while you were editing.</span>
          <Button size="sm" onClick={reload}>
            Reload
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConflict(false)}>
            Keep editing
          </Button>
        </div>
      )}
      <div className={styles.frame}>
        <div className={styles.gutter} ref={gutter} aria-hidden>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className={syntax?.line === i + 1 ? styles.errorLine : undefined}>
              {i + 1}
            </div>
          ))}
        </div>
        <div className={styles.code}>
          <pre className={styles.layer} ref={layer} aria-hidden>
            {spans.map((s, i) =>
              s.cls === "plain" ? s.text : (
                <span key={i} className={styles[s.cls]}>
                  {s.text}
                </span>
              ),
            )}
            {"\n"}
          </pre>
          <textarea
            className={styles.input}
            aria-label={`${label} text`}
            aria-invalid={shownError ? true : undefined}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            wrap="off"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setApplyError(null);
            }}
            onKeyDown={onKeyDown}
            onScroll={onScroll}
          />
        </div>
      </div>
      {shownError && (
        <p className={styles.error} role="alert" data-testid="json-editor-error">
          {shownError} — the preview keeps the last applied aura.
        </p>
      )}
    </section>
  );
}
