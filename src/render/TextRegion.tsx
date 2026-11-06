"use client";

import type { CSSProperties } from "react";
import { getField, type AuraDocument, type LuaValue } from "@/core";
import type { AuraRenderState } from "./conditions";
import { fontFlagsStyle, useWowFont } from "./fonts";
import { FrozenMarker, textValues } from "./IconRegion";
import { color } from "./subregions/SubText";
import { formatText } from "./text-format";
import { rgbaCss } from "./TurnedTexture";

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

/** The text a text region shows (Text.lua:330-345): format codes replaced; an empty result shows as " "; `\n` breaks lines. */
export function displayText(aura: AuraDocument, state: AuraRenderState, name: string): string {
  const raw = state.properties.displayText ?? aura.displayText ?? "%p";
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
export function TextRegion({ aura, state, name }: { aura: AuraDocument; state: AuraRenderState; name: string; width: number; height: number }) {
  const p = state.properties;
  const font = useWowFont(aura.font);
  const fixed = aura.automaticWidth === "Fixed";
  const wrap = aura.wordWrap !== "Elide";
  const justify = typeof aura.justify === "string" ? aura.justify.toLowerCase() : "left";
  const style: CSSProperties = {
    display: "block",
    position: "relative",
    color: rgbaCss(color(p.color)),
    fontFamily: font.family,
    fontSize: num(p.fontSize ?? aura.fontSize, 12),
    lineHeight: 1,
    textAlign: justify as CSSProperties["textAlign"],
    width: fixed ? num(aura.fixedWidth, 200) : undefined,
    whiteSpace: fixed ? (wrap ? "pre-wrap" : "pre") : "pre",
    overflowWrap: fixed && wrap ? "anywhere" : undefined,
    overflow: fixed && !wrap ? "hidden" : undefined,
    textOverflow: fixed && !wrap ? "ellipsis" : undefined,
    pointerEvents: "none",
    ...fontFlagsStyle(aura.outline ?? "OUTLINE", {
      color: color(aura.shadowColor, [0, 0, 0, 1]),
      x: num(aura.shadowXOffset, 1),
      y: num(aura.shadowYOffset, -1),
    }),
  };
  return (
    <span style={style} data-testid="text-region" data-font={font.status}>
      {displayText(aura, state, name)}
      {state.frozenMarker && <FrozenMarker size={8} />}
    </span>
  );
}
