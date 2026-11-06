"use client";

/**
 * Field widgets for the options editor, one per AceConfig option type. Each is a small, plain
 * component (props in, `onEdit` out) so it can be swapped for the UI kit's Input/Select/Slider/Switch.
 */
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import type { LuaKey, OptionNode } from "@/core";
import { searchSpells, type SpellSearchHit } from "@/components/spell-picker/spell-api";
import { imageName, plainText, splitInputValue } from "./wow-text";
import { WowText } from "./WowText";
import styles from "./OptionsEditor.module.css";

export interface EditOptions {
  /** Many changes in a row (slider drag): the editor waits ~50 ms for the last one. */
  continuous?: boolean;
}

export interface FieldProps {
  node: OptionNode;
  /** The value to show: the option's get(), or the user's not-yet-applied edit. */
  value: unknown;
  disabled: boolean;
  onEdit(value: unknown, options?: EditOptions): void;
}

function Label({ node, htmlFor }: { node: OptionNode; htmlFor?: string }) {
  const name = plainText(node.name);
  if (!name) return null;
  return (
    <label className={styles.label} htmlFor={htmlFor} title={plainText(node.desc) || undefined}>
      <WowText text={node.name} />
    </label>
  );
}

export function ToggleField({ node, value, disabled, onEdit }: FieldProps) {
  const id = useId();
  // AceConfig toggles are true/false/nil; some getters return other truthy values.
  const checked = value !== undefined && value !== null && value !== false;
  return (
    <div className={styles.toggle} title={plainText(node.desc) || undefined}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onEdit(e.target.checked)} />
      <label htmlFor={id}>
        <WowText text={node.name} />
      </label>
    </div>
  );
}

const isMultiline = (node: OptionNode) =>
  node.multiline === true || (typeof node.multiline === "number" && node.multiline > 1) || /MultiLine/i.test(node.control ?? "");

/** Text input; applies on Enter or when it loses focus, like the game's edit boxes. */
export function InputField({ node, value, disabled, onEdit }: FieldProps) {
  const id = useId();
  const { shown, raw } = splitInputValue(value);
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? raw;
  const multiline = isMultiline(node);
  const spellInput = node.control === "WeakAurasInputFocus";
  const apply = () => {
    if (draft !== null && draft !== raw) onEdit(draft);
    setDraft(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      apply();
    } else if (e.key === "Escape") setDraft(null);
  };
  return (
    <div className={styles.field}>
      <Label node={node} htmlFor={id} />
      {multiline ? (
        <textarea
          id={id}
          className={styles.textarea}
          value={text}
          disabled={disabled}
          rows={typeof node.multiline === "number" ? Math.min(node.multiline, 12) : 4}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={apply}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
      ) : spellInput ? (
        <SpellInput id={id} text={text} disabled={disabled} onDraft={setDraft} onApply={apply} onKeyDown={onKeyDown} onChoose={(v) => {
          setDraft(null);
          if (v !== raw) onEdit(v);
        }} />
      ) : (
        <input
          id={id}
          className={styles.input}
          value={text}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={apply}
          onKeyDown={onKeyDown}
        />
      )}
      {shown !== raw && draft === null && <span className={styles.hint}>{plainText(shown)}</span>}
    </div>
  );
}

/** The addon's spell input (WeakAurasInputFocus): typed IDs or names, with the spell cache's search. */
function SpellInput(props: {
  id: string;
  text: string;
  disabled: boolean;
  onDraft(text: string): void;
  onApply(): void;
  onChoose(value: string): void;
  onKeyDown(e: KeyboardEvent<HTMLInputElement>): void;
}) {
  const { id, text, disabled, onDraft, onApply, onChoose, onKeyDown } = props;
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<{ q: string; list: SpellSearchHit[] }>({ q: "", list: [] });
  const q = text.trim();
  const searchable = open && q.length >= 2 && !/^\d+$/.test(q);
  useEffect(() => {
    if (!searchable) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      searchSpells(q, ac.signal)
        .then((r) => setHits({ q, list: r.results.slice(0, 8) }))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, searchable]);
  const list = searchable && hits.q === q ? hits.list : [];
  return (
    <div className={styles.spellInput}>
      <input
        id={id}
        className={styles.input}
        value={text}
        disabled={disabled}
        placeholder="Spell ID or name"
        onChange={(e) => {
          onDraft(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onApply();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          onKeyDown(e);
        }}
      />
      {list.length > 0 && (
        <ul className={styles.suggestions} role="listbox">
          {list.map((hit) => (
            <li
              key={hit.id}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onChoose(String(hit.id));
              }}
            >
              {hit.name} <span className={styles.muted}>{hit.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Slider plus number box (the addon's WeakAurasSpinBox). Dragging applies continuously. */
export function RangeField({ node, value, disabled, onEdit }: FieldProps) {
  const id = useId();
  const min = finite(node.softMin) ? node.softMin : finite(node.min) ? node.min : 0;
  const max = finite(node.softMax) ? node.softMax : finite(node.max) ? node.max : 100;
  const step = finite(node.bigStep) ? node.bigStep : finite(node.step) && node.step > 0 ? node.step : (max - min) / 100 || 1;
  const current = finite(value) ? value : min;
  const [typed, setTyped] = useState<string | null>(null);
  const clampHard = (v: number) => Math.min(finite(node.max) ? node.max : Infinity, Math.max(finite(node.min) ? node.min : -Infinity, v));
  const scale = node.isPercent ? 100 : 1;
  const applyTyped = () => {
    if (typed === null) return;
    const v = Number(typed) / scale;
    setTyped(null);
    if (typed.trim() !== "" && Number.isFinite(v) && v !== current) onEdit(clampHard(v));
  };
  return (
    <div className={styles.field}>
      <Label node={node} htmlFor={id} />
      <div className={styles.range}>
        <input
          type="range"
          aria-label={plainText(node.name)}
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, current))}
          disabled={disabled}
          onChange={(e) => onEdit(Number(e.target.value), { continuous: true })}
        />
        <input
          id={id}
          type="number"
          className={styles.number}
          value={typed ?? String(Math.round(current * scale * 1000) / 1000)}
          disabled={disabled}
          step="any"
          onChange={(e) => setTyped(e.target.value)}
          onBlur={applyTyped}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyTyped();
            if (e.key === "Escape") setTyped(null);
          }}
        />
        {node.isPercent && <span className={styles.muted}>%</span>}
      </div>
    </div>
  );
}

const keyText = (k: LuaKey) => `${typeof k}:${String(k)}`;
/** LibSharedMedia lists map media names to file paths; the game shows the name. */
const isMediaList = (node: OptionNode) => /LSM30/.test(node.dialogControl ?? "");

export function SelectField({ node, value, disabled, onEdit }: FieldProps) {
  const id = useId();
  const values = node.values ?? [];
  const media = isMediaList(node);
  const index = values.findIndex(([k]) => k === value);
  return (
    <div className={styles.field}>
      <Label node={node} htmlFor={id} />
      <select
        id={id}
        className={styles.select}
        value={index < 0 ? "" : keyText(values[index][0])}
        disabled={disabled}
        onChange={(e) => {
          const chosen = values.find(([k]) => keyText(k) === e.target.value);
          if (chosen) onEdit(chosen[0]);
        }}
      >
        {index < 0 && <option value="">{value === undefined || value === null ? "" : String(value)}</option>}
        {values.map(([k, label]) => (
          <option key={keyText(k)} value={keyText(k)}>
            {media ? String(k) : plainText(label)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MultiSelectField({ node, value, disabled, onEdit }: FieldProps) {
  const checked = new Map((Array.isArray(value) ? (value as [LuaKey, boolean][]) : []).map(([k, v]) => [keyText(k), v]));
  return (
    <fieldset className={styles.multiselect} disabled={disabled}>
      <legend className={styles.label}>
        <WowText text={node.name} />
      </legend>
      {(node.values ?? []).map(([k, label]) => (
        <label key={keyText(k)} className={styles.toggle}>
          <input type="checkbox" checked={checked.get(keyText(k)) === true} onChange={(e) => onEdit([k, e.target.checked])} />
          {plainText(label) ? <WowText text={label} /> : <span className={styles.muted}>(none)</span>}
        </label>
      ))}
    </fieldset>
  );
}

const hex2 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");

/** Colour as the addon stores it: [r, g, b, a], each 0..1. */
export function ColorField({ node, value, disabled, onEdit }: FieldProps) {
  const id = useId();
  const [r, g, b, a] = Array.isArray(value) ? (value as number[]).map(Number) : [1, 1, 1, 1];
  const alpha = Number.isFinite(a) ? a : 1;
  return (
    <div className={styles.color}>
      <input
        id={id}
        type="color"
        value={`#${hex2(r)}${hex2(g)}${hex2(b)}`}
        disabled={disabled}
        onChange={(e) => {
          const h = e.target.value;
          const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
          onEdit([...c, alpha], { continuous: true });
        }}
      />
      <label htmlFor={id} title={plainText(node.desc) || undefined}>
        <WowText text={node.name} />
      </label>
      {node.hasAlpha !== false && (
        <input
          type="range"
          className={styles.alpha}
          aria-label={`${plainText(node.name)} opacity`}
          min={0}
          max={1}
          step={0.01}
          value={alpha}
          disabled={disabled}
          onChange={(e) => onEdit([r, g, b, Number(e.target.value)], { continuous: true })}
        />
      )}
    </div>
  );
}

/** The addon's icon buttons (WeakAurasIcon), drawn as text glyphs: the textures are the addon's own. */
const ICON_GLYPHS: Record<string, string> = {
  moveup: "↑",
  movedown: "↓",
  delete: "✕",
  duplicate: "⧉",
  add: "+",
  template: "▤",
  sidebar: "≡",
};

export function ExecuteField({ node, disabled, onEdit }: Omit<FieldProps, "value">) {
  const name = plainText(node.name);
  const image = imageName(node.image);
  if (node.control === "WeakAurasExpand" || node.control === "WeakAurasExpandSmall") {
    // Section headers: the image says whether the section is collapsed.
    const collapsed = image === "expand" || image.endsWith("expand");
    const bullet = image.startsWith("bullet");
    return (
      <button
        type="button"
        className={node.control === "WeakAurasExpand" ? styles.section : styles.expandSmall}
        aria-expanded={bullet ? undefined : !collapsed}
        disabled={disabled || !node.canRun}
        onClick={() => onEdit(undefined)}
      >
        {!bullet && <span className={styles.chevron}>{collapsed ? "▸" : "▾"}</span>}
        {bullet && <span className={styles.chevron}>•</span>}
        <WowText text={node.name} />
      </button>
    );
  }
  if (node.control === "WeakAurasIcon") {
    const glyph = ICON_GLYPHS[image];
    // Spell/item icons next to inputs (the image is a game icon): nothing to click here.
    if (!glyph && !name) return null;
    return (
      <button
        type="button"
        className={styles.iconButton}
        title={name || plainText(node.desc) || undefined}
        aria-label={name || image || "Button"}
        disabled={disabled || !node.canRun}
        onClick={() => onEdit(undefined)}
      >
        {glyph ?? name}
      </button>
    );
  }
  if (!name) return null;
  return (
    <button
      type="button"
      className={styles.button}
      title={plainText(node.desc) || undefined}
      disabled={disabled || !node.canRun}
      onClick={() => onEdit(undefined)}
    >
      <WowText text={node.name} />
    </button>
  );
}
