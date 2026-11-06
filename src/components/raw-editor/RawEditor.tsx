"use client";

import { useDeferredValue, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import {
  LuaLiteralError,
  isLuaTable,
  parseCanonicalJson,
  parseLuaLiteral,
  printCanonicalJson,
  printLuaLiteral,
  type AuraDocument,
} from "@/core";
import { highlight } from "./highlight";
import styles from "./RawEditor.module.css";

export type RawFormat = "lua" | "json";

export type ApplyResult = { ok: true } | { ok: false; error: string };

export interface RawEditorProps {
  /** The current aura document. When it changes (paste, push, another editor) the text follows, unless it has unapplied edits. */
  value: AuraDocument;
  /** Called with the edited document on Apply. A failed result is shown and the text is kept. */
  onChange(doc: AuraDocument): ApplyResult | void;
}

interface ParseError {
  message: string;
  line: number | null;
}

type Parsed = { ok: true; doc: AuraDocument } | { ok: false; error: ParseError };

function format(doc: AuraDocument, mode: RawFormat): string {
  return mode === "lua" ? printLuaLiteral(doc) : printCanonicalJson(doc);
}

function parse(text: string, mode: RawFormat): Parsed {
  try {
    const value = mode === "lua" ? parseLuaLiteral(text) : parseCanonicalJson(text);
    if (!isLuaTable(value) || Array.isArray(value)) {
      return { ok: false, error: { message: "The aura must be a table with named fields, like { id = \"…\" }", line: null } };
    }
    return { ok: true, doc: value };
  } catch (e) {
    if (e instanceof LuaLiteralError) return { ok: false, error: { message: e.message, line: e.line } };
    return { ok: false, error: { message: e instanceof Error ? e.message : String(e), line: null } };
  }
}

/** A mode-independent identity for a document: its Lua text has sorted keys. */
const docKey = (doc: AuraDocument) => printLuaLiteral(doc);

/**
 * The aura's raw table as editable text: a Lua table literal (as WeakAuras writes it) or the canonical JSON.
 * Edits apply on Apply or Ctrl/Cmd+Enter; until then the preview keeps the last applied aura. Text that
 * doesn't parse shows an error with its line and is never thrown away.
 */
export function RawEditor({ value, onChange }: RawEditorProps) {
  const [mode, setMode] = useState<RawFormat>("lua");
  const valueKey = useMemo(() => docKey(value), [value]);
  const [text, setText] = useState(() => format(value, mode));
  /** The text that shows the document last seen (`seenKey`); text differing from it has unapplied edits. */
  const [synced, setSynced] = useState(text);
  const [seenKey, setSeenKey] = useState(valueKey);
  const [conflict, setConflict] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // The document changed (here or elsewhere): follow it unless that would throw away edits.
  if (valueKey !== seenKey) {
    setSeenKey(valueKey);
    const parsed = text === synced ? null : parse(text, mode);
    if (text === synced) {
      const next = format(value, mode);
      setText(next);
      setSynced(next);
      setConflict(false);
    } else if (parsed?.ok && docKey(parsed.doc) === valueKey) {
      setSynced(text); // our own Apply coming back: keep the text as typed
      setConflict(false);
    } else {
      setConflict(true);
    }
  }

  const dirty = text !== synced;
  const deferredText = useDeferredValue(text);
  const check = useMemo(() => (deferredText === synced ? null : parse(deferredText, mode)), [deferredText, synced, mode]);
  const error = check && !check.ok ? check.error : null;

  function apply() {
    const parsed = parse(text, mode);
    if (!parsed.ok) {
      setApplyError(parsed.error.message);
      return;
    }
    const result = onChange(parsed.doc);
    if (result && !result.ok) {
      setApplyError(result.error);
      return;
    }
    setApplyError(null);
    setConflict(false);
    if (docKey(parsed.doc) === seenKey) setSynced(text); // no change to the document
  }

  function reload() {
    const next = format(value, mode);
    setText(next);
    setSynced(next);
    setConflict(false);
    setApplyError(null);
  }

  function switchMode(next: RawFormat) {
    if (next === mode) return;
    if (!dirty) {
      const t = format(value, next);
      setText(t);
      setSynced(t);
    } else {
      const parsed = parse(text, mode);
      if (!parsed.ok) {
        setApplyError(`Fix the error before switching to ${next === "lua" ? "Lua" : "JSON"}: ${parsed.error.message}`);
        return;
      }
      setText(format(parsed.doc, next));
      setSynced(format(value, next));
    }
    setApplyError(null);
    setMode(next);
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

  const spans = useMemo(() => highlight(text, mode), [text, mode]);
  const lineCount = useMemo(() => text.split("\n").length, [text]);
  const shownError = applyError ?? error?.message;

  return (
    <section className={styles.editor} aria-label="Raw table" data-testid="raw-editor">
      <div className={styles.toolbar}>
        <h2 className={styles.title}>Raw table</h2>
        <div className={styles.modes} role="group" aria-label="Format">
          <button type="button" aria-pressed={mode === "lua"} onClick={() => switchMode("lua")}>
            Lua
          </button>
          <button type="button" aria-pressed={mode === "json"} onClick={() => switchMode("json")}>
            JSON
          </button>
        </div>
        <span className={styles.state} data-testid="raw-editor-state">
          {dirty ? "Unapplied edits" : "In sync"}
        </span>
        <button type="button" onClick={reload} disabled={!dirty}>
          Revert
        </button>
        <button type="button" className={styles.apply} onClick={apply} disabled={!dirty} title="Ctrl/Cmd+Enter">
          Apply
        </button>
      </div>
      {conflict && (
        <div className={styles.conflict} role="status">
          <span>The aura changed elsewhere while you were editing.</span>
          <button type="button" onClick={reload}>
            Reload
          </button>
          <button type="button" onClick={() => setConflict(false)}>
            Keep editing
          </button>
        </div>
      )}
      <div className={styles.frame}>
        <div className={styles.gutter} ref={gutter} aria-hidden>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className={error?.line === i + 1 ? styles.errorLine : undefined}>
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
            aria-label="Raw table text"
            aria-invalid={error ? true : undefined}
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
        <p className={styles.error} role="alert" data-testid="raw-editor-error">
          {shownError}
          {error && " — the preview keeps the last applied aura."}
        </p>
      )}
    </section>
  );
}
