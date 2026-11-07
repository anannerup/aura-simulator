"use client";

/**
 * The web stand-ins for the options window's dialogs (icon, texture and model pickers, the code editor,
 * confirmations). A button of the addon's options opens one (the VM reports `OptionDialog`); the choice goes back
 * through the same button, so the addon applies it the way its own dialog would.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { plainText, type OptionDialog } from "@/core";
import { GameTexture } from "@/components/ui";
import { useSpellSearch } from "@/components/spell-picker/useSpellSearch";
import { iconNameUrl } from "@/api/spells";
import { displayIconRef } from "@/render/textures";
import { WowText } from "./WowText";
import styles from "./Widgets.module.css";

export interface OptionDialogProps {
  dialog: OptionDialog;
  /** The button's name, for the dialog's title. */
  title: string;
  onChoose(value: unknown): void;
  onClose(): void;
}

export function OptionDialogView({ dialog, title, onChoose, onClose }: OptionDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  let body: ReactNode;
  let heading = title;
  switch (dialog.kind) {
    case "icon":
      heading = "Choose an icon";
      body = <IconPicker current={dialog.current} onChoose={onChoose} />;
      break;
    case "texture":
      heading = "Choose a texture";
      body = <TexturePicker dialog={dialog} onChoose={onChoose} />;
      break;
    case "model":
      heading = "Choose a model";
      body = <ModelPicker current={dialog.current} onChoose={onChoose} />;
      break;
    case "text":
      heading = dialog.title ? `${title}: ${dialog.title}` : title;
      body = <TextEditor dialog={dialog} onChoose={onChoose} onClose={onClose} />;
      break;
    case "confirm":
      heading = "Are you sure?";
      body = (
        <>
          <p className={styles.dialogText}>
            <WowText text={dialog.text} />
          </p>
          <div className={styles.dialogButtons}>
            <button type="button" className={styles.dialogPrimary} onClick={() => onChoose(true)}>
              {plainText(dialog.accept)}
            </button>
            <button type="button" className={styles.dialogButton} onClick={onClose}>
              {plainText(dialog.cancel)}
            </button>
          </div>
        </>
      );
      break;
    case "textReplacements":
      heading = "Dynamic text replacements";
      body = (
        <p className={styles.dialogText}>
          Text can show trigger values with codes such as %p (time left), %t (total time), %n (name), %i (icon), %s
          (stacks), and %1.p for trigger 1. The agent docs list them all.
        </p>
      );
      break;
    case "unsupported":
      body = <p className={styles.dialogText}>{dialog.message}</p>;
      break;
  }

  return (
    <div className={styles.dialogBackdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={heading} className={styles.dialog} data-dialog={dialog.kind}>
        <div className={styles.dialogHeader}>
          <h3>{heading}</h3>
          <button type="button" className={styles.dialogClose} aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={styles.dialogBody}>{body}</div>
      </div>
    </div>
  );
}

const ICON_PATH = (name: string) => `Interface\\Icons\\${name}`;

/** The game's icon picker: search icons by spell name, or enter an icon name or FileDataID. */
function IconPicker({ current, onChoose }: { current?: string | number; onChoose(value: unknown): void }) {
  const [q, setQ] = useState("");
  const query = q.trim();
  const { hits, error } = useSpellSearch(query, { enabled: query.length >= 2 && !/^\d+$/.test(query) });
  const byIcon = new Map<string, string[]>();
  for (const hit of hits ?? []) if (hit.icon) byIcon.set(hit.icon, [...(byIcon.get(hit.icon) ?? []), hit.name]);
  const icons = [...byIcon].map(([icon, spells]) => ({ icon, spells }));
  const ref = displayIconRef(current);
  const typed = /^\d+$/.test(query) ? Number(query) : /^[a-z0-9_]+$/i.test(query) && query.includes("_") ? ICON_PATH(query) : null;
  return (
    <div className={styles.iconPicker}>
      <p className={styles.dialogMuted}>
        Current:{" "}
        {ref?.kind === "name" ? (
          // eslint-disable-next-line @next/next/no-img-element -- Wowhead image server, loaded at runtime
          <img src={iconNameUrl(ref.name, "small")} alt="" className={styles.inlineIcon} />
        ) : null}{" "}
        <code>{current === undefined || current === "" ? "none" : String(current)}</code>
      </p>
      <input
        className={styles.dialogInput}
        placeholder="Search by spell name, or an icon name (spell_holy_…) or FileDataID"
        aria-label="Search icons"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && typed !== null && onChoose(typed)}
      />
      {typed !== null && (
        <button type="button" className={styles.dialogButton} onClick={() => onChoose(typed)}>
          Use {typeof typed === "number" ? `FileDataID ${typed}` : query}
        </button>
      )}
      {error && <p className={styles.dialogError}>{error}</p>}
      <ul className={styles.iconGrid} aria-label="Icons">
        {icons.map(({ icon, spells }) => (
          <li key={icon}>
            <button type="button" title={`${icon}\n${spells.slice(0, 4).join(", ")}`} aria-label={icon} onClick={() => onChoose(ICON_PATH(icon))}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Wowhead image server, loaded at runtime */}
              <img src={iconNameUrl(icon, "medium")} alt="" />
            </button>
          </li>
        ))}
      </ul>
      {hits !== null && icons.length === 0 && <p className={styles.dialogMuted}>No spells with icons match.</p>}
    </div>
  );
}

/** The game's texture picker: the addon's texture lists by category. */
function TexturePicker({ dialog, onChoose }: { dialog: Extract<OptionDialog, { kind: "texture" }>; onChoose(value: unknown): void }) {
  const [cat, setCat] = useState(() =>
    Math.max(0, dialog.categories.findIndex((c) => c.textures.some(([p]) => p === String(dialog.current)))),
  );
  const [filter, setFilter] = useState("");
  const [typed, setTyped] = useState("");
  const textures = (dialog.categories[cat]?.textures ?? []).filter(([p, n]) => !filter || `${p} ${n}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className={styles.texturePicker}>
      <div className={styles.dialogRow}>
        <select aria-label="Category" className={styles.dialogInput} value={cat} onChange={(e) => setCat(Number(e.target.value))}>
          {dialog.categories.map((c, i) => (
            <option key={c.name} value={i}>
              {plainText(c.name)} ({c.textures.length})
            </option>
          ))}
        </select>
        <input className={styles.dialogInput} placeholder="Filter" aria-label="Filter textures" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <ul className={styles.textureGrid} aria-label="Textures">
        {textures.slice(0, 300).map(([path, name]) => (
          <li key={path}>
            <button type="button" title={path} aria-label={plainText(name)} aria-pressed={path === String(dialog.current)} onClick={() => onChoose(path)}>
              <span className={styles.textureThumb}>{/^\d+$/.test(path) || /[\\/]/.test(path) ? <GameTexture source={/^\d+$/.test(path) ? Number(path) : path} size={56} /> : null}</span>
              <span className={styles.textureName}>{plainText(name)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.dialogRow}>
        <input
          className={styles.dialogInput}
          placeholder="Or a texture path, atlas name or FileDataID"
          aria-label="Texture path"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && typed.trim() && onChoose(typed.trim())}
        />
        <button type="button" className={styles.dialogButton} disabled={!typed.trim()} onClick={() => onChoose(typed.trim())}>
          Use
        </button>
      </div>
    </div>
  );
}

function ModelPicker({ current, onChoose }: { current?: string | number; onChoose(value: unknown): void }) {
  const [text, setText] = useState(current === undefined ? "" : String(current));
  return (
    <div className={styles.dialogRow}>
      <input
        className={styles.dialogInput}
        aria-label="Model FileDataID"
        placeholder="Model FileDataID (from wago.tools)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && /^\d+$/.test(text.trim()) && onChoose(text.trim())}
      />
      <button type="button" className={styles.dialogPrimary} disabled={!/^\d+$/.test(text.trim())} onClick={() => onChoose(text.trim())}>
        Use
      </button>
      <p className={styles.dialogMuted}>The game screen shows models as a labelled placeholder.</p>
    </div>
  );
}

function TextEditor({ dialog, onChoose, onClose }: { dialog: Extract<OptionDialog, { kind: "text" }>; onChoose(value: unknown): void; onClose(): void }) {
  const [text, setText] = useState(dialog.current);
  return (
    <div className={styles.textEditor}>
      <textarea
        className={styles.codeArea}
        aria-label="Code"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const t = e.currentTarget;
            const { selectionStart: a, selectionEnd: b } = t;
            setText(text.slice(0, a) + "  " + text.slice(b));
            requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2));
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onChoose(text);
        }}
      />
      <div className={styles.dialogButtons}>
        {dialog.url && (
          <a href={dialog.url} target="_blank" rel="noreferrer" className={styles.dialogLink}>
            Help
          </a>
        )}
        <button type="button" className={styles.dialogPrimary} onClick={() => onChoose(text)}>
          Done
        </button>
        <button type="button" className={styles.dialogButton} onClick={onClose}>
          Cancel
        </button>
      </div>
      {dialog.lua && <p className={styles.dialogMuted}>Custom code is kept and exported; the preview doesn&apos;t run it.</p>}
    </div>
  );
}
