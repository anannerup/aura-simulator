"use client";

/**
 * The game's media dropdowns (LibSharedMedia's LSM30_* widgets, the addon's sound lists): each entry previewed the
 * way the game's dropdown shows it: fonts in their own font, bar textures, borders and backgrounds as a strip,
 * sounds with a play button. Media is loaded at runtime (fonts and textures via src/render), never committed.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { plainText, type LuaKey, type OptionNode } from "@/core";
import { GameTexture } from "@/components/ui";
import { ensureFont, fontFamily, fontUrl } from "@/render/fonts";
import { BORDER_EDGES, FONTS, STATUSBAR_TEXTURES } from "@/render/media";
import styles from "./Widgets.module.css";

export type MediaKind = "font" | "statusbar" | "border" | "background" | "sound";

const SOUND_FILE = /\.(ogg|mp3|wav)$/i;

/** Which media an option lists, from its widget (or, for the addon's own sound lists, its values). */
export function mediaKind(node: OptionNode): MediaKind | null {
  const control = node.dialogControl ?? node.control ?? "";
  if (/LSM30_Font/.test(control)) return "font";
  if (/LSM30_Statusbar/.test(control)) return "statusbar";
  if (/LSM30_Border/.test(control)) return "border";
  if (/LSM30_Background/.test(control)) return "background";
  if (/LSM30_Sound/.test(control)) return "sound";
  if (node.type === "select" && (node.values ?? []).some(([k, l]) => SOUND_FILE.test(String(k)) || SOUND_FILE.test(String(l)))) return "sound";
  return null;
}

/** LSM lists map the name (shown) to the file; the addon's own lists map the file to the name. */
function entry(kind: MediaKind, node: OptionNode, key: LuaKey, label: string) {
  const lsm = /LSM30/.test(node.dialogControl ?? node.control ?? "");
  const name = lsm ? String(key) : plainText(label);
  const file = lsm ? label : String(key);
  return { name, file, kind };
}

function soundUrl(file: string): string | null {
  if (/^\d+$/.test(file)) return fontUrl(Number(file));
  if (/^interface[\\/]addons[\\/]weakauras/i.test(file)) return fontUrl(file);
  return null;
}

let playing: HTMLAudioElement | null = null;
function play(url: string) {
  playing?.pause();
  playing = new Audio(url);
  void playing.play().catch(() => {});
}

function Preview({ kind, name, file }: { kind: MediaKind; name: string; file: string }): ReactNode {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (kind !== "font" || seen || !ref.current) return;
    const io = new IntersectionObserver((list) => list.some((e) => e.isIntersecting) && setSeen(true));
    io.observe(ref.current);
    return () => io.disconnect();
  }, [kind, seen]);
  useEffect(() => {
    if (kind === "font" && seen && name in FONTS) ensureFont(name);
  }, [kind, seen, name]);

  if (kind === "font") {
    return (
      <span ref={ref} className={styles.mediaFont} style={{ fontFamily: fontFamily(name) }} data-font={name}>
        {name}
      </span>
    );
  }
  if (kind === "sound") {
    const url = soundUrl(file);
    return (
      <span className={styles.mediaName}>
        {url && (
          <span
            role="button"
            tabIndex={-1}
            className={styles.play}
            aria-label={`Play ${name}`}
            title="Play"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              play(url);
            }}
          >
            ▶
          </span>
        )}
        {name}
      </span>
    );
  }
  const source = kind === "statusbar" ? (STATUSBAR_TEXTURES[name] ?? file) : kind === "border" ? (BORDER_EDGES[name] ?? null) : file;
  return (
    <span className={styles.mediaName}>
      <span className={kind === "statusbar" ? styles.mediaBar : styles.mediaTile}>
        {source !== null && source !== "" && !/^UI-HUD/i.test(String(source)) ? (
          <GameTexture source={source} size={kind === "statusbar" ? 96 : 18} height={kind === "statusbar" ? 12 : 18} />
        ) : null}
      </span>
      {name}
    </span>
  );
}

export interface MediaSelectProps {
  node: OptionNode;
  kind: MediaKind;
  value: unknown;
  disabled: boolean;
  onEdit(value: LuaKey): void;
}

/** A dropdown listing media with previews. Keyboard: arrows move, Enter picks, Escape closes, letters filter. */
export function MediaSelect({ node, kind, value, disabled, onEdit }: MediaSelectProps) {
  const id = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const entries = (node.values ?? []).map(([k, l]) => ({ key: k, ...entry(kind, node, k, l) }));
  const shown = filter ? entries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase())) : entries;
  const current = entries.find((e) => e.key === value);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (key: LuaKey) => {
    setOpen(false);
    setFilter("");
    if (key !== value) onEdit(key);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((i) => Math.max(0, Math.min(shown.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" && open && shown[active]) {
      e.preventDefault();
      pick(shown[active].key);
    } else if (e.key === "Escape") {
      setOpen(false);
      setFilter("");
    }
  };
  const name = plainText(node.name);

  return (
    <div className={styles.mediaRoot} ref={root} data-media={kind}>
      {name && (
        <label className={styles.mediaLabel} htmlFor={id}>
          {name}
        </label>
      )}
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        className={styles.mediaButton}
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setActive(Math.max(0, shown.findIndex((e) => e.key === value)));
        }}
        onKeyDown={onKeyDown}
      >
        {current ? <Preview kind={kind} name={current.name} file={current.file} /> : <span>{value === undefined || value === null ? "" : String(value)}</span>}
      </button>
      {open && (
        <div className={styles.mediaPanel}>
          <input
            className={styles.mediaFilter}
            placeholder="Filter"
            aria-label={`Filter ${name || "list"}`}
            value={filter}
            autoFocus
            onChange={(e) => {
              setFilter(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <ul id={listId} role="listbox" aria-label={name || "Media"} className={styles.mediaList}>
            {shown.map((e, i) => (
              <li
                key={`${typeof e.key}:${String(e.key)}`}
                role="option"
                data-index={i}
                aria-selected={e.key === value}
                data-active={i === active || undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(e.key)}
              >
                <Preview kind={kind} name={e.name} file={e.file} />
              </li>
            ))}
            {shown.length === 0 && <li className={styles.mediaEmpty}>Nothing matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
