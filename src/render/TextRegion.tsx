"use client";

import type { CSSProperties } from "react";
import { num } from "@/core";
import { fontFlagsStyle, textWidthStyle, useWowFont } from "./fonts";
import { color, rgbaCss } from "./color";
import { DrawnTextParts } from "./DrawnTextParts";
import type { RegionProps } from "./region-types";

/**
 * The text region (RegionTypes/Text.lua): a font string sized by its text ("Auto" width) or `fixedWidth` wide
 * with word wrap or elide. Font, size, outline, shadow, colour and justify as in the game. The preview pins the
 * region at its anchor by `selfPoint`; its size comes from the text, the evaluation's `displayText` (Text.lua:330-345).
 */
export function TextRegion({ aura, state }: RegionProps) {
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
      <DrawnTextParts text={state.displayText} />
    </span>
  );
}
