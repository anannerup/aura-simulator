"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { plainText, type AuraCore, type AuraDocument, type OptionNode, type OptionsTree } from "@/core";
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
import { OptionEdits, optionId, type Draft, type OptionEditsDeps } from "./option-edits";
import { WowText } from "./WowText";
import styles from "./OptionsEditor.module.css";
import { errorMessage } from "@/lib/errors";

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

/**
 * The in-game options window for one aura: the addon's own tabs and option tables (via the aura
 * core), rendered as a form. Every change goes through the option's own set() in the addon VM (`OptionEdits`).
 */
export function OptionsEditor({ core, aura, childAuras = NO_CHILDREN, onChange }: OptionsEditorProps) {
  const [tab, setTab] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<OptionsTree | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const deps: OptionEditsDeps = { setOption: (...args) => core.setOption(...args), onChange };
  const [edits] = useState(() => new OptionEdits(deps, { aura, children: childAuras }));
  const { drafts, errors, pending, dialog, rebuilds } = useSyncExternalStore(edits.subscribe, edits.getView, edits.getView);
  useEffect(() => {
    edits.connect(deps);
  });
  useEffect(() => {
    edits.setDocument({ aura, children: childAuras });
  }, [edits, aura, childAuras]);
  useEffect(() => () => edits.dispose(), [edits]);

  // What the shown tree was built for; the editor is busy until it matches the current request.
  const [builtFor, setBuiltFor] = useState<unknown>(null);
  const request = useMemo(() => ({ aura, childAuras, tab, rebuilds }), [aura, childAuras, tab, rebuilds]);
  useEffect(() => {
    let cancelled = false;
    core.options({ aura: request.aura, children: request.childAuras }, { tab: request.tab }).then(
      (r) => {
        if (cancelled) return;
        setResult(r);
        setBuiltFor(request);
        setLoadError(null);
        edits.treeBuilt();
      },
      (e: unknown) => {
        if (cancelled) return;
        setLoadError(errorMessage(e));
        setBuiltFor(request);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [core, edits, request]);

  const tabKey = result?.tab;
  const edit = useCallback(
    (node: OptionNode, value: unknown, options?: EditOptions) => {
      if (tabKey) edits.edit(tabKey, node, value, options);
    },
    [edits, tabKey],
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
        {result?.warning && <p className={styles.error}>The addon reported an error loading this aura: {result.warning}</p>}
        {result?.error && <p className={styles.error}>This tab could not be built: {result.error}</p>}
        {dialog && (
          <OptionDialogView
            dialog={dialog.dialog}
            title={plainText(dialog.node.name) || "Options"}
            onClose={() => edits.closeDialog()}
            onChoose={(value) => edits.chooseInDialog(value)}
          />
        )}
        {result?.tree && (
          <OptionList
            nodes={result.tree.args ?? []}
            fullWidth={result.fullWidth}
            drafts={drafts}
            errors={errors}
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
          <OptionItem key={optionId(node.path)} node={node} fullWidth={fullWidth} drafts={drafts} errors={errors} onEdit={onEdit} />
        ))}
    </div>
  );
}

function OptionItem({ node, ...list }: Omit<ListProps, "nodes"> & { node: OptionNode }) {
  const id = optionId(node.path);
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
