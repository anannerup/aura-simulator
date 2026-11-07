"use client";

import type { CSSProperties } from "react";
import { getField, num, type AuraDocument, type AuraRenderState } from "@/core";
import { fontFlagsStyle, textWidthStyle, useWowFont } from "./fonts";
import { color, rgbaCss } from "./color";
import { formatText, textValues } from "./text-format";
import type { RegionProps } from "./region-types";
import { WowString } from "./WowString";


/**
 * The text a text region shows (Text.lua:330-345): format codes replaced; an empty result shows as " "; `\n` breaks lines.
 * The font string then interprets WoW's escapes (`WowString`).
 */
function displayText(aura: AuraDocument, state: AuraRenderState, name: string): string {
  const raw = state.properties.displayText ?? "%p";
  const source = typeof raw === "string" ? raw : String(raw);
  const text = formatText(
    source,
    (key) => {
      const v = getField(aura, `displayText_format_${key}`);
      return typeof v === "number" ? v : undefined;
    },
    textValues(state, name),
  ).replace(/\\n/g, "\n");
  return text === "" ? " " : text;
}

/**
 * The text region (RegionTypes/Text.lua): a font string sized by its text ("Auto" width) or `fixedWidth` wide
 * with word wrap or elide. Font, size, outline, shadow, colour and justify as in the game. The preview pins the
 * region at its anchor by `selfPoint`; its size comes from the text.
 */
export function TextRegion({ aura, state, name }: RegionProps) {
  const p = state.properties;
  const font = useWowFont(aura.font);
  const justify = typeof aura.justify === "string" ? aura.justify.toLowerCase() : "left";
  const style: CSSProperties = {
    display: "block",
    position: "relative",
    color: rgbaCss(color(p.color)),
    fontFamily: font.family,
    fontSize: num(p.fontSize, 12),
    lineHeight: 1,
    textAlign: justify as CSSProperties["textAlign"],
    ...textWidthStyle(aura.automaticWidth === "Fixed" ? num(aura.fixedWidth, 200) : undefined, aura.wordWrap),
    pointerEvents: "none",
    ...fontFlagsStyle(aura.outline ?? "OUTLINE", {
      color: color(aura.shadowColor, [0, 0, 0, 1]),
      x: num(aura.shadowXOffset, 1),
      y: num(aura.shadowYOffset, -1),
    }),
  };
  return (
    <span style={style} data-testid="text-region" data-font={font.status}>
      <WowString text={displayText(aura, state, name)} />
    </span>
  );
}
