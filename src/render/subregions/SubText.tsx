"use client";

import type { CSSProperties } from "react";
import { getField, num, type AuraRenderState, type LuaTable } from "@/core";
import { color, rgbaCss } from "../color";
import { regionInfo } from "../region-types";
import { anchorFraction } from "../screen/geometry";
import { fontFlagsStyle, textWidthStyle, useWowFont } from "../fonts";
import { DrawnTextParts } from "../DrawnTextParts";
import { anchorPosition, type SubRegionHost } from "./host";
import styles from "./subregions.module.css";


/**
 * A text sub-region (SubRegionTypes/SubText.lua): format codes, font, size, outline/shadow, colour, justify,
 * fixed width with word wrap or elide, anchored on the parent like the addon. Condition-driven properties come
 * from `state.properties` (`sub.N.text_*`); the text it draws is the evaluation's (`state.texts`), which the
 * preview reports too. X/Y Offset is `text_anchorXOffset`/`text_anchorYOffset` (SubText.lua Anchor); the
 * `anchorXOffset` keys in the addon's sub text defaults are never read.
 */
export function SubText({
  element,
  position,
  state,
  host,
}: {
  element: LuaTable;
  position: number;
  state: AuraRenderState;
  host: SubRegionHost;
}) {
  const p = state.properties;
  const g = (k: string) => getField(element, k);
  const parent = regionInfo(host.regionType);
  const defaults = parent.subText;
  const drawn = state.texts[position];
  const visible = drawn?.visible ?? p[`sub.${position}.text_visible`] !== false;
  const textColor = color(p[`sub.${position}.text_color`]);
  const alpha = num(p[`sub.${position}.text_alpha`], 1);
  const anchorPoint = typeof g("anchor_point") === "string" ? String(g("anchor_point")) : defaults.anchor;
  const anchor = host.point(anchorPoint);
  const ownSelfPoint = g("text_selfPoint");
  const selfPoint = typeof ownSelfPoint === "string" && ownSelfPoint !== "AUTO" ? ownSelfPoint : parent.autoSelfPoint(anchorPoint);
  const [sx, sy] = anchorFraction(selfPoint);
  const at = anchorPosition(
    anchor,
    num(p[`sub.${position}.text_anchorXOffset`], 0),
    num(p[`sub.${position}.text_anchorYOffset`], 0),
  );
  const font = useWowFont(g("text_font"));
  const flags = fontFlagsStyle(g("text_fontType") ?? defaults.fontType, {
    color: color(g("text_shadowColor"), [0, 0, 0, 1]),
    x: num(g("text_shadowXOffset"), defaults.shadowX),
    y: num(g("text_shadowYOffset"), defaults.shadowY),
  });
  const rotate = g("rotateText") === "LEFT" ? -90 : g("rotateText") === "RIGHT" ? 90 : 0;
  const style: CSSProperties = {
    left: at.left,
    top: at.top,
    transform: `translate(${-sx * 100}%, ${-sy * 100}%)${rotate ? ` rotate(${rotate}deg)` : ""}`,
    transformOrigin: `${sx * 100}% ${sy * 100}%`,
    color: rgbaCss(textColor),
    opacity: visible ? alpha : 0,
    fontSize: num(p[`sub.${position}.text_fontSize`], 12),
    fontFamily: font.family,
    textAlign: (String(g("text_justify") ?? "CENTER").toLowerCase() as CSSProperties["textAlign"]) ?? "center",
    ...textWidthStyle(g("text_automaticWidth") === "Fixed" ? num(g("text_fixedWidth"), 64) : undefined, g("text_wordWrap")),
    ...flags,
  };
  return (
    <span
      className={styles.subText}
      style={style}
      data-subregion="subtext"
      data-index={position}
      data-visible={visible ? "true" : "false"}
      data-font={font.status}
    >
      <DrawnTextParts text={drawn} />
    </span>
  );
}
