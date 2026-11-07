"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AuraCore, AuraDocument, AuraState, OptionDialog, OptionNode, OptionsTree } from "@/core";
import {
  ColorField,
  ExecuteField,
  InputField,
  MultiSelectField,
  RangeField,
  SelectField,
  ToggleField,
  type EditOptions,
  type FieldProps,
} from "./fields";
import { OptionDialogView } from "./OptionDialogs";
import { plainText } from "./wow-text";
import { WowText } from "./WowText";
import styles from "./OptionsEditor.module.css";

export interface OptionsEditorProps {
  core: AuraCore;
  aura: AuraDocument;
  /** A group's descendants (registered in the addon VM too, so group options can see them). */
  childAuras?: AuraDocument[];
  /**
   * Called with the edited aura; the page encodes and loads it (state code, preview, undo, validation). A group's
   * edits can change its descendants too (its tabs edit them, as in the game): then `children` holds all of them.
   */
  onChange(doc: AuraDocument, children?: AuraDocument[]): { ok: boolean; error?: string } | void;
}

const NO_CHILDREN: AuraDocument[] = [];
const SLIDER_DELAY_MS = 50;
const idOf = (path: string[]) => path.join("\u001f");
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Draft {
  value: unknown;
  /** The edit has gone through the VM; drop the draft when the next option tree arrives. */
  done: boolean;
}

/**
 * The in-game options window for one aura: the addon's own tabs and option tables (via the aura
 * core), rendered as a form. Every change goes through the option's own set() in the addon VM.
 */
export function OptionsEditor({ core, aura, childAuras = NO_CHILDREN, onChange }: OptionsEditorProps) {
  const [tab, setTab] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<OptionsTree | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Edits on their way through the addon VM (tests and tools wait for 0).
  const [pending, setPending] = useState(0);
  // A dialog one of the addon's buttons opened (icon picker, code editor, confirmation, …).
  const [dialog, setDialog] = useState<{ node: OptionNode; dialog: OptionDialog } | null>(null);

  // The latest document, for edits queued behind each other (the page's aura lags one render).
  const latest = useRef<AuraState>({ aura, children: childAuras });
  useEffect(() => {
    latest.current = { aura, children: childAuras };
  }, [aura, childAuras]);

  // What the shown tree was built for; the editor is busy until it matches the current request.
  const [builtFor, setBuiltFor] = useState<unknown>(null);
  const request = useMemo(() => ({ aura, childAuras, tab, refresh }), [aura, childAuras, tab, refresh]);
  useEffect(() => {
    let cancelled = false;
    core.options({ aura: request.aura, children: request.childAuras }, { tab: request.tab }).then(
      (r) => {
        if (cancelled) return;
        setResult(r);
        setBuiltFor(request);
        setLoadError(null);
        setDrafts((d) => {
          const kept = Object.entries(d).filter(([, draft]) => !draft.done);
          return kept.length === Object.keys(d).length ? d : Object.fromEntries(kept);
        });
      },
      (e: unknown) => {
        if (cancelled) return;
        setLoadError(message(e));
        setBuiltFor(request);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [core, request]);

  const queue = useRef<Promise<void>>(Promise.resolve());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  const setFieldError = useCallback((id: string, error: string | null) => {
    setFieldErrors((errors) => {
      if (error === null) {
        if (!(id in errors)) return errors;
        const next = { ...errors };
        delete next[id];
        return next;
      }
      return { ...errors, [id]: error };
    });
  }, []);

  const tabKey = result?.tab;
  const commit = useCallback(
    (node: OptionNode, value: unknown) => {
      if (!tabKey) return;
      const id = idOf(node.path);
      setPending((n) => n + 1);
      queue.current = queue.current.then(async () => {
        try {
          const edit = await core.setOption(latest.current, { tab: tabKey, path: node.path }, value);
          if (edit.dialog) setDialog({ node, dialog: edit.dialog });
          if (edit.changed) {
            const previous = latest.current;
            latest.current = { aura: edit.aura, children: edit.children ?? previous.children };
            const r = onChange(edit.aura, edit.children);
            if (r && !r.ok) {
              latest.current = previous;
              setFieldError(id, r.error ?? "The page could not take this change");
              setRefresh((n) => n + 1);
            } else {
              setFieldError(id, edit.warning ? `The addon reported an error during this change: ${edit.warning}` : null);
            }
          } else {
            setFieldError(id, null);
            setRefresh((n) => n + 1);
          }
        } catch (e) {
          setFieldError(id, message(e));
          setRefresh((n) => n + 1);
        } finally {
          setPending((n) => n - 1);
          setDrafts((d) => (d[id] && (node.type === "multiselect" || d[id].value === value) ? { ...d, [id]: { value: d[id].value, done: true } } : d));
        }
      });
    },
    [core, tabKey, onChange, setFieldError],
  );

  const edit = useCallback(
    (node: OptionNode, value: unknown, options?: EditOptions) => {
      const id = idOf(node.path);
      if (node.type === "multiselect") {
        // An edit is one [key, checked] pair; the field shows the whole list with that pair changed.
        const [key, checked] = value as [unknown, boolean];
        setDrafts((d) => {
          const base = (d[id]?.value ?? node.value) as [unknown, boolean][] | undefined;
          const list = (Array.isArray(base) ? base : []).map(([k, v]): [unknown, boolean] => [k, k === key ? checked : v]);
          return { ...d, [id]: { value: list, done: false } };
        });
      } else if (node.type !== "execute") setDrafts((d) => ({ ...d, [id]: { value, done: false } }));
      const pending = timers.current.get(id);
      if (pending) clearTimeout(pending);
      if (options?.continuous) {
        timers.current.set(
          id,
          setTimeout(() => {
            timers.current.delete(id);
            commit(node, value);
          }, SLIDER_DELAY_MS),
        );
      } else {
        timers.current.delete(id);
        commit(node, value);
      }
    },
    [commit],
  );

  const busy = pending > 0 || builtFor !== request;
  const tabs = result?.tabs ?? [];
  const active = result?.tab;
  return (
    <section className={styles.editor} aria-label="Aura options" aria-busy={busy} data-busy={busy ? "true" : "false"}>
      <div className={styles.tabs} role="tablist" aria-label="Options tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === active}
            className={styles.tab}
            onClick={() => setTab(t.key)}
          >
            {plainText(t.label)}
          </button>
        ))}
      </div>
      <div className={styles.panel} role="tabpanel" aria-label={tabs.find((t) => t.key === active)?.label}>
        {loadError && <p className={styles.error}>{loadError}</p>}
        {!result && !loadError && <p className={styles.muted}>Loading the addon&apos;s options…</p>}
        {result?.error && <p className={styles.error}>This tab could not be built: {result.error}</p>}
        {dialog && (
          <OptionDialogView
            dialog={dialog.dialog}
            title={plainText(dialog.node.name) || "Options"}
            onClose={() => setDialog(null)}
            onChoose={(value) => {
              const { node } = dialog;
              setDialog(null);
              commit(node, value);
            }}
          />
        )}
        {result?.tree && (
          <OptionList
            nodes={result.tree.args ?? []}
            fullWidth={result.fullWidth}
            drafts={drafts}
            errors={fieldErrors}
            onEdit={edit}
          />
        )}
      </div>
    </section>
  );
}

interface ListProps {
  nodes: OptionNode[];
  fullWidth: number;
  drafts: Record<string, Draft>;
  errors: Record<string, string>;
  onEdit(node: OptionNode, value: unknown, options?: EditOptions): void;
}

const FULL_BY_DEFAULT = new Set(["header", "description", "group", "multiselect"]);

/** AceConfig widths: "full", "double", "half", "normal" or a multiple of the normal width; a row is `fullWidth` wide. */
function basis(node: OptionNode, fullWidth: number): string {
  const w = node.width;
  if (w === "full" || (w === undefined && FULL_BY_DEFAULT.has(node.type))) return "100%";
  const units = typeof w === "number" ? w : w === "double" ? 2 : w === "half" ? 0.5 : 1;
  return `${Math.min(100, (units / fullWidth) * 100)}%`;
}

function OptionList({ nodes, fullWidth, drafts, errors, onEdit }: ListProps) {
  return (
    <div className={styles.flow}>
      {nodes
        .filter((n) => !n.hidden)
        .map((node) => (
          <OptionItem key={idOf(node.path)} node={node} fullWidth={fullWidth} drafts={drafts} errors={errors} onEdit={onEdit} />
        ))}
    </div>
  );
}

function OptionItem({ node, ...list }: Omit<ListProps, "nodes"> & { node: OptionNode }) {
  const id = idOf(node.path);
  const style: CSSProperties = { flexBasis: basis(node, list.fullWidth), maxWidth: basis(node, list.fullWidth) };
  const getError = node.errors?.get;
  const error = list.errors[id];
  const common = {
    "data-option": node.path.join("/"),
    "data-type": node.type,
    "data-control": node.control ?? node.dialogControl,
    style,
    className: styles.item,
  };

  if (node.type === "group") {
    return (
      <fieldset {...common} className={`${styles.item} ${styles.group}`}>
        {node.name && (
          <legend>
            <WowText text={node.name} />
          </legend>
        )}
        <OptionList {...list} nodes={node.args ?? []} />
      </fieldset>
    );
  }
  if (node.type === "header") {
    const name = plainText(node.name);
    return (
      <div {...common} className={`${styles.item} ${styles.header}`} role={name ? "heading" : "separator"} aria-level={name ? 3 : undefined}>
        {name && (
          <span>
            <WowText text={node.name} />
          </span>
        )}
      </div>
    );
  }
  if (node.type === "description") {
    const text = plainText(node.name);
    return (
      <div {...common}>
        {text && (
          <p className={styles.description} data-font-size={node.fontSize}>
            <WowText text={node.name} />
          </p>
        )}
      </div>
    );
  }

  const draft = list.drafts[id];
  const props: FieldProps = {
    node,
    value: draft ? draft.value : node.value,
    disabled: node.disabled === true || getError !== undefined || (node.type !== "execute" && node.canSet === false),
    onEdit: (value, options) => list.onEdit(node, value, options),
  };
  let field;
  switch (node.type) {
    case "toggle":
      field = <ToggleField {...props} />;
      break;
    case "input":
      field = <InputField {...props} />;
      break;
    case "range":
      field = <RangeField {...props} />;
      break;
    case "select":
      field = <SelectField {...props} />;
      break;
    case "multiselect":
      field = <MultiSelectField {...props} />;
      break;
    case "color":
      field = <ColorField {...props} />;
      break;
    case "execute":
      field = <ExecuteField {...props} />;
      break;
    default:
      field = <p className={styles.muted}>{plainText(node.name)} (unsupported option type “{node.type}”)</p>;
  }
  return (
    <div {...common} aria-invalid={error ? true : undefined}>
      {field}
      {getError && (
        <p className={styles.note} title={getError}>
          The simulated client can&apos;t answer this option.
        </p>
      )}
      {error && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
