/**
 * What a text draws: the text region's `displayText` and each sub text's `text_text` (after conditions: a condition's
 * `sub.N.text_text` is SubText.lua's ChangeText), with the placeholders replaced as WeakAuras.lua's
 * ReplacePlaceHolders does (%p, %t, %s, %n, optionally %N.p / %{p}, and %%; Types.lua's timed formatters).
 *
 * Custom text (%c, %c2, …: the aura's custom text function's results) needs the aura's own Lua run, which the
 * simulator doesn't do: each one is a `{custom}` part, drawn as a visible marker (`[%c]`) and reported as
 * `customText: true`, never silently left out. Pure; the evaluators put the result in `AuraRenderState`, which both
 * the game screen and the preview read.
 */
import { getField, isLuaTable, list, type AuraDocument, type LuaTable, type LuaValue } from "../lua-value";
import type { TriggerState } from "./triggers";

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

/** A piece of a drawn text: literal text, or a custom text placeholder (`c`, `c2`, …) the simulator can't evaluate. */
export type TextPart = string | { custom: string };

export interface DrawnText {
  /** What the text draws, with each custom text placeholder as its marker (`[%c]`). */
  text: string;
  /** The text in pieces, so the game screen can draw the custom text markers apart. */
  parts: TextPart[];
  /** The text has custom text (%c) the simulator didn't evaluate (the aura's custom function isn't run). */
  customText: boolean;
  /** Its visibility after conditions (sub texts' `sub.N.text_visible`; a text region is always visible). */
  visible: boolean;
}

/** The marker drawn in place of a custom text placeholder. */
export const customTextMarker = (symbol: string) => `[%${symbol}]`;

export interface TextValues {
  /** Dynamic info per trigger number, and the default one (activeTriggerMode) under key 0. */
  states: Map<number, TriggerState | undefined>;
  name: string;
  /** Forever's native stack text (Aura (Modern)), replacing %s when given. */
  stackText?: string;
}

/**
 * Replaces the placeholders in `text`. `option(key)` reads a formatter option, e.g. `p_time_format` or
 * `2.p_time_precision` (stored as `text_text_format_<key>` on sub texts and `displayText_format_<key>` on the text
 * region). A symbol is letters and digits after `%` (WeakAuras.lua ReplacePlaceHolders), so `%c2` is custom text 2;
 * unknown symbols give "".
 */
export function formatText(text: string, option: (key: string) => number | undefined, values: TextValues): TextPart[] {
  const parts: TextPart[] = [];
  const push = (part: TextPart) => {
    if (typeof part === "string" && typeof parts.at(-1) === "string") parts[parts.length - 1] += part;
    else if (part !== "") parts.push(part);
  };
  let last = 0;
  const re = /%(?:\{(?:(\d+)\.)?([^}]*)\}|(?:(\d+)\.)?([a-zA-Z][0-9a-zA-Z]*)|(%))/g;
  for (const m of text.matchAll(re)) {
    push(text.slice(last, m.index));
    last = m.index + m[0].length;
    const [, bTrig, bSym, trig, sym, pct] = m;
    if (pct) {
      push("%");
      continue;
    }
    const symbol: string = bSym ?? sym;
    if (/^c\d*$/.test(symbol)) {
      push({ custom: symbol });
      continue;
    }
    push(symbolValue(symbol, Number(bTrig ?? trig ?? 0), option, values));
  }
  push(text.slice(last));
  return parts;
}

function symbolValue(symbol: string, triggerNum: number, option: (key: string) => number | undefined, values: TextValues): string {
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
}

function drawn(parts: TextPart[], visible: boolean): DrawnText {
  return {
    text: parts.map((p) => (typeof p === "string" ? p : customTextMarker(p.custom))).join(""),
    parts,
    customText: parts.some((p) => typeof p !== "string"),
    visible,
  };
}

const numberOption = (table: LuaTable, prefix: string) => (key: string) => {
  const v = getField(table, `${prefix}${key}`);
  return typeof v === "number" ? v : undefined;
};

/** The evaluation's values for the placeholders: each trigger's state, the dynamic one as trigger 0, %n the aura's id. */
export function textValues(aura: AuraDocument, triggers: TriggerState[], dynamic: TriggerState | undefined): TextValues {
  const states = new Map<number, TriggerState | undefined>(triggers.map((t) => [t.index, t]));
  states.set(0, dynamic);
  return { states, name: typeof aura.id === "string" ? aura.id : "aura" };
}

/**
 * Each sub text's drawn text by its 1-based place in `subRegions`: `sub.N.text_text` and `sub.N.text_visible` from
 * `properties` (the document's values with active conditions applied). `nativeStackText` is Forever's Aura (Modern)
 * stack text per place.
 */
export function subTexts(
  aura: AuraDocument,
  properties: Record<string, LuaValue>,
  values: TextValues,
  nativeStackText: Record<number, string> = {},
): Record<number, DrawnText> {
  const texts: Record<number, DrawnText> = {};
  list(aura.subRegions).forEach((element, i) => {
    if (!isLuaTable(element) || getField(element, "type") !== "subtext") return;
    const position = i + 1;
    const raw = properties[`sub.${position}.text_text`];
    const source = typeof raw === "string" ? raw : "";
    const parts = formatText(source, numberOption(element, "text_text_format_"), { ...values, stackText: nativeStackText[position] });
    texts[position] = drawn(parts, properties[`sub.${position}.text_visible`] !== false);
  });
  return texts;
}

/** Every text the aura draws: its sub texts and, for a text region, its own text. */
export function auraTexts(
  aura: AuraDocument,
  properties: Record<string, LuaValue>,
  triggers: TriggerState[],
  dynamic: TriggerState | undefined,
  nativeStackText: Record<number, string> = {},
): { texts: Record<number, DrawnText>; displayText?: DrawnText } {
  const values = textValues(aura, triggers, dynamic);
  const texts = subTexts(aura, properties, values, nativeStackText);
  return aura.regionType === "text" ? { texts, displayText: regionText(aura, properties, values) } : { texts };
}

/**
 * The text region's drawn text (Text.lua:330-345): `displayText` after conditions, its codes replaced, `\n` as line
 * breaks; an empty result draws as " ".
 */
export function regionText(aura: AuraDocument, properties: Record<string, LuaValue>, values: TextValues): DrawnText {
  const raw = properties.displayText ?? "%p";
  const parts = formatText(typeof raw === "string" ? raw : String(raw), numberOption(aura as LuaTable, "displayText_format_"), values).map((p) =>
    typeof p === "string" ? p.replace(/\\n/g, "\n") : p,
  );
  return drawn(parts.length ? parts : [" "], true);
}
