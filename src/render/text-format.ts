/** Text replacements for sub-region texts (%p, %t, %s, %n), following WeakAuras' formatters. */
import { getField, type LuaTable } from "@/core";
import type { AuraRenderState, TriggerState } from "@/core";

/**
 * The "timed" formatter (Types.lua:355-470): format 0 becomes the fixed formatter 99 (:362-367), which
 * rounds up and shows m:ss above 60 s (:207-216); below the dynamic threshold (default 60) it shows
 * `precision` decimals (default 1). Nothing for 0 or less.
 */
export function formatTime(value: number | undefined, options: { threshold?: number; precision?: number; format?: number } = {}): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "";
  const threshold = options.threshold ?? 60;
  const precision = options.precision ?? 1;
  const mmss = (v: number) => {
    if (options.format === 1) return blizzardAbbrev(v);
    const c = Math.ceil(v);
    return c > 60 ? `${Math.floor(c / 60)}:${String(c % 60).padStart(2, "0")}` : String(c);
  };
  if (threshold > 0 && value < threshold) return value.toFixed(precision);
  return mmss(value);
}

function blizzardAbbrev(v: number): string {
  if (v >= 86400) return `${Math.ceil(v / 86400)}d`;
  if (v >= 3600) return `${Math.ceil(v / 3600)}h`;
  if (v >= 60) return `${Math.ceil(v / 60)}m`;
  return String(Math.ceil(v));
}

export interface TextValues {
  /** Dynamic info per trigger number, and the default one (activeTriggerMode) under key 0. */
  states: Map<number, TriggerState | undefined>;
  name: string;
  /** Native stack text (Aura (Modern)), replacing %s when given. */
  stackText?: string;
}

/** %-replacement inputs: each trigger's state, and the dynamic (activeTriggerMode) one as trigger 0. */
export function textValues(state: AuraRenderState, name: string): TextValues {
  const states = new Map<number, TriggerState | undefined>(state.triggers.map((t) => [t.index, t]));
  states.set(0, state.dynamic);
  return { states, name };
}

/** Replaces %p, %t, %s, %n (optionally %N.p / %{p}) and %% in a sub-region text. Unknown symbols give "". */
export function formatSubText(element: LuaTable, values: TextValues): string {
  const text = getField(element, "text_text");
  if (typeof text !== "string") return "";
  return formatText(text, (key) => {
    const v = getField(element, `text_text_format_${key}`);
    return typeof v === "number" ? v : undefined;
  }, values);
}

/**
 * Replaces %p, %t, %s, %n (optionally %N.p / %{p}) and %% in a text. `option(key)` reads a formatter option,
 * e.g. `p_time_format` or `2.p_time_precision` (stored as `text_text_format_<key>` on sub-texts and
 * `displayText_format_<key>` on the text region). Unknown symbols give "".
 */
export function formatText(text: string, option: (key: string) => number | undefined, values: TextValues): string {
  return text.replace(/%(?:\{(?:(\d+)\.)?([^}]*)\}|(?:(\d+)\.)?([a-zA-Z]+)|(%))/g, (_m, bTrig, bSym, trig, sym, pct) => {
    if (pct) return "%";
    const symbol: string = bSym ?? sym;
    const triggerNum = Number(bTrig ?? trig ?? 0);
    const state = values.states.get(triggerNum);
    const prefix = `${triggerNum ? `${triggerNum}.` : ""}${symbol}_`;
    switch (symbol) {
      case "p":
      case "t": {
        const value = symbol === "p" ? state?.remaining : state?.duration;
        return formatTime(value, {
          format: option(`${prefix}time_format`),
          threshold: option(`${prefix}time_dynamic_threshold`),
          precision: option(`${prefix}time_precision`),
        });
      }
      case "s":
        if (values.stackText !== undefined && triggerNum === 0) return values.stackText;
        // Prototypes.lua dynamic_texts.s: nothing for 0 stacks.
        return state && state.stacks !== 0 ? String(state.stacks) : "";
      case "n":
        return state ? values.name : "";
      default:
        return "";
    }
  });
}
