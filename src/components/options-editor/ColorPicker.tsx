"use client";

/**
 * The game's colour option: a swatch that opens a colour picker (the game's ColorPickerFrame: a saturation/value
 * square, hue and opacity bars, and the values as numbers). Colours are what the addon stores: [r, g, b, a], 0..1.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { hsvToRgb, rgbaCss, rgbToHsv, type Rgba } from "@/render/color";
import styles from "./Widgets.module.css";

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

const hex2 = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
export const rgbHex = ([r, g, b]: readonly number[]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** Parses #rgb, #rrggbb or #rrggbbaa; null when it isn't one. */
export function parseHex(text: string): number[] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const parts = h.match(/../g)!.map((p) => parseInt(p, 16) / 255);
  return parts;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export interface ColorPickerProps {
  /** The swatch's accessible name (the option's name). */
  label: string;
  value: Rgba;
  hasAlpha: boolean;
  disabled?: boolean;
  /** Every change while dragging (`continuous`), and the final one. */
  onChange(value: Rgba, continuous: boolean): void;
}

export function ColorPicker({ label, value, hasAlpha, disabled, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: globalThis.PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={styles.colorRoot}>
      <button
        type="button"
        className={styles.swatch}
        aria-label={`${label}: ${rgbHex(value)}${hasAlpha ? `, opacity ${Math.round(value[3] * 100)}%` : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        data-color={value.map(round3).join(",")}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.swatchChecker} aria-hidden />
        <span className={styles.swatchFill} style={{ background: rgbaCss(hasAlpha ? value : [value[0], value[1], value[2]]) }} aria-hidden />
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label={`${label} colour`} className={styles.colorPanel}>
          <ColorPanel value={value} hasAlpha={hasAlpha} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

/** Drag on an element: calls `onMove` with the pointer position inside it (0..1 each). */
function useDrag(onMove: (x: number, y: number, done: boolean) => void) {
  const move = (e: PointerEvent<HTMLElement>, done: boolean) => {
    const box = e.currentTarget.getBoundingClientRect();
    onMove(clamp01((e.clientX - box.left) / box.width), clamp01((e.clientY - box.top) / box.height), done);
  };
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      e.currentTarget.setPointerCapture(e.pointerId);
      move(e, false);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e, false);
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e, true);
    },
  };
}

function ColorPanel({ value, hasAlpha, onChange }: Omit<ColorPickerProps, "label" | "disabled">) {
  // Hue and saturation are kept while they can't be read back from the colour (grey, black).
  const [hsv, setHsv] = useState(() => rgbToHsv(value[0], value[1], value[2]));
  const [h, s, v] = hsv;
  const alpha = value[3];
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  const emit = (next: [number, number, number], a: number, done: boolean) => {
    setHsv(next);
    const [r, g, b] = hsvToRgb(...next);
    onChange([round3(r), round3(g), round3(b), round3(a)], !done);
  };
  const sv = useDrag((x, y, done) => emit([h, x, 1 - y], alpha, done));
  const hue = useDrag((x, _y, done) => emit([x * 360, s, v], alpha, done));
  const opacity = useDrag((x, _y, done) => {
    const [r, g, b] = hsvToRgb(h, s, v);
    onChange([round3(r), round3(g), round3(b), round3(x)], !done);
  });
  const keyStep = (e: KeyboardEvent<HTMLElement>, apply: (dx: number, dy: number) => void) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    e.preventDefault();
    apply(d[0], d[1]);
  };
  const setChannel = (i: number, text: string) => {
    const n = Number(text);
    if (!Number.isFinite(n)) return;
    const next: [number, number, number, number] = [...value];
    next[i] = clamp01(i < 3 ? n / 255 : n / 100);
    if (i < 3) setHsv(rgbToHsv(next[0], next[1], next[2]));
    onChange([round3(next[0]), round3(next[1]), round3(next[2]), round3(next[3])], false);
  };
  const applyHex = () => {
    if (hexDraft === null) return;
    const parsed = parseHex(hexDraft);
    setHexDraft(null);
    if (!parsed) return;
    const next: Rgba = [parsed[0], parsed[1], parsed[2], hasAlpha && parsed.length === 4 ? parsed[3] : alpha];
    setHsv(rgbToHsv(next[0], next[1], next[2]));
    onChange([round3(next[0]), round3(next[1]), round3(next[2]), round3(next[3])], false);
  };
  const pure = hsvToRgb(h, 1, 1);

  return (
    <div className={styles.colorPanelBody}>
      <div
        className={styles.svSquare}
        style={{ background: rgbHex(pure) }}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
        aria-valuetext={`saturation ${Math.round(s * 100)}%, brightness ${Math.round(v * 100)}%`}
        {...sv}
        onKeyDown={(e) => keyStep(e, (dx, dy) => emit([h, clamp01(s + dx), clamp01(v + dy)], alpha, true))}
      >
        <span className={styles.svWhite} aria-hidden />
        <span className={styles.svBlack} aria-hidden />
        <span className={styles.svThumb} style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }} aria-hidden />
      </div>
      <div
        className={styles.hueBar}
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(h)}
        {...hue}
        onKeyDown={(e) => keyStep(e, (dx) => emit([(h + dx * 360 + 360) % 360, s, v], alpha, true))}
      >
        <span className={styles.barThumb} style={{ left: `${(h / 360) * 100}%` }} aria-hidden />
      </div>
      {hasAlpha && (
        <div
          className={styles.alphaBar}
          role="slider"
          tabIndex={0}
          aria-label="Opacity"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(alpha * 100)}
          {...opacity}
          onKeyDown={(e) =>
            keyStep(e, (dx) => {
              const [r, g, b] = hsvToRgb(h, s, v);
              onChange([round3(r), round3(g), round3(b), round3(clamp01(alpha + dx))], false);
            })
          }
        >
          <span className={styles.alphaFill} style={{ background: `linear-gradient(to right, transparent, ${rgbHex(value)})` }} aria-hidden />
          <span className={styles.barThumb} style={{ left: `${alpha * 100}%` }} aria-hidden />
        </div>
      )}
      <div className={styles.colorFields}>
        <label>
          <span>Hex</span>
          <input
            aria-label="Hex"
            value={hexDraft ?? rgbHex(value) + (hasAlpha && alpha < 1 ? hex2(alpha) : "")}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={applyHex}
            onKeyDown={(e) => e.key === "Enter" && applyHex()}
            spellCheck={false}
          />
        </label>
        {(["R", "G", "B"] as const).map((c, i) => (
          <label key={c}>
            <span>{c}</span>
            <NumberBox aria-label={c} value={Math.round(value[i] * 255)} max={255} onCommit={(t) => setChannel(i, t)} />
          </label>
        ))}
        {hasAlpha && (
          <label>
            <span>A %</span>
            <NumberBox aria-label="Opacity %" value={Math.round(alpha * 100)} max={100} onCommit={(t) => setChannel(3, t)} />
          </label>
        )}
      </div>
    </div>
  );
}

function NumberBox({ value, max, onCommit, ...rest }: { value: number; max: number; onCommit(text: string): void; "aria-label": string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() !== "") onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      {...rest}
      type="number"
      min={0}
      max={max}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}
