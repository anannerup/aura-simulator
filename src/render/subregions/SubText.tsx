"use client";

import type { CSSProperties } from "react";
import { getField, type LuaTable, type LuaValue } from "@/core";
import { anchorFraction } from "../anchor";
import type { AuraRenderState } from "../conditions";
import { fontFlagsStyle, useWowFont } from "../fonts";
import { formatSubText, type TextValues } from "../text-format";
import { rgbaCss } from "../TurnedTexture";
import type { SubRegionHost } from "./host";
import styles from "./subregions.module.css";

const POINTS = new Set(["TOPLEFT", "TOP", "TOPRIGHT", "LEFT", "CENTER", "RIGHT", "BOTTOMLEFT", "BOTTOM", "BOTTOMRIGHT"]);

/** Private.inverse_point_types (Types.lua:1457). */
export const INVERSE_POINTS: Record<string, string> = {
  TOPLEFT: "BOTTOMRIGHT",
  TOP: "BOTTOM",
  TOPRIGHT: "BOTTOMLEFT",
  LEFT: "RIGHT",
  CENTER: "CENTER",
  RIGHT: "LEFT",
  BOTTOMLEFT: "TOPRIGHT",
  BOTTOM: "TOP",
  BOTTOMRIGHT: "TOPLEFT",
};

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

export function color(value: LuaValue | undefined, fallback: [number, number, number, number] = [1, 1, 1, 1]): [number, number, number, number] {
  const c = Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((i) => (typeof c[i] === "number" ? Math.min(1, Math.max(0, c[i] as number)) : fallback[i])) as [number, number, number, number];
}

/** SubText.lua:510-538 resolveSelfPoint: what AUTO means per parent region type. */
export function resolveSelfPoint(selfPoint: string, anchorPoint: string, regionType: string): string {
  if (selfPoint !== "AUTO") return POINTS.has(selfPoint) ? selfPoint : "CENTER";
  if (regionType === "icon") {
    if (anchorPoint.startsWith("INNER_")) return anchorPoint.slice(6);
    if (anchorPoint.startsWith("OUTER_")) return INVERSE_POINTS[anchorPoint.slice(6)] ?? "CENTER";
    return "CENTER";
  }
  if (regionType === "aurabar") {
    let p = anchorPoint;
    if (p.startsWith("ICON_")) p = p.slice(5);
    else if (p.startsWith("INNER_")) p = p.slice(6);
    return POINTS.has(p) ? p : "CENTER";
  }
  return INVERSE_POINTS[anchorPoint] ?? "CENTER";
}

/** SubText.lua:16-67: icons default to an outline without shadow, other parents to a shadow without outline. */
function parentDefaults(regionType: string) {
  return regionType === "icon"
    ? { fontType: "OUTLINE", shadowX: 0, shadowY: 0, anchor: "CENTER" }
    : { fontType: "None", shadowX: 1, shadowY: -1, anchor: regionType === "aurabar" ? "INNER_RIGHT" : "BOTTOMLEFT" };
}

/**
 * A text sub-region (SubRegionTypes/SubText.lua): format codes, font, size, outline/shadow, colour, justify,
 * fixed width with word wrap or elide, anchored on the parent like the addon. Condition-driven properties come
 * from `state.properties` (`sub.N.text_*`).
 */
export function SubText({
  element,
  position,
  state,
  values,
  host,
}: {
  element: LuaTable;
  position: number;
  state: AuraRenderState;
  values: TextValues;
  host: SubRegionHost;
}) {
  const p = state.properties;
  const g = (k: string) => getField(element, k);
  const defaults = parentDefaults(host.regionType);
  const visible = p[`sub.${position}.text_visible`] !== false;
  const textColor = color(p[`sub.${position}.text_color`] ?? g("text_color"));
  const alpha = num(p[`sub.${position}.text_alpha`], 1);
  const anchorPoint = typeof g("anchor_point") === "string" ? String(g("anchor_point")) : defaults.anchor;
  const anchor = host.point(anchorPoint);
  const selfPoint = resolveSelfPoint(typeof g("text_selfPoint") === "string" ? String(g("text_selfPoint")) : "AUTO", anchorPoint, host.regionType);
  const [ax, ay] = anchorFraction(POINTS.has(anchor.point) ? anchor.point : "CENTER");
  const [sx, sy] = anchorFraction(selfPoint);
  const x = num(p[`sub.${position}.text_anchorXOffset`] ?? g("text_anchorXOffset") ?? g("anchorXOffset"), 0) + anchor.dx;
  const y = num(p[`sub.${position}.text_anchorYOffset`] ?? g("text_anchorYOffset") ?? g("anchorYOffset"), 0) + anchor.dy;
  const font = useWowFont(g("text_font"));
  const flags = fontFlagsStyle(g("text_fontType") ?? defaults.fontType, {
    color: color(g("text_shadowColor"), [0, 0, 0, 1]),
    x: num(g("text_shadowXOffset"), defaults.shadowX),
    y: num(g("text_shadowYOffset"), defaults.shadowY),
  });
  const fixed = g("text_automaticWidth") === "Fixed";
  const wrap = g("text_wordWrap") !== "Elide";
  const rotate = g("rotateText") === "LEFT" ? -90 : g("rotateText") === "RIGHT" ? 90 : 0;
  const text = formatSubText(element, { ...values, stackText: state.nativeStackText[position] });
  const style: CSSProperties = {
    left: anchor.box.left + anchor.box.width * ax + x,
    top: anchor.box.top + anchor.box.height * ay - y,
    transform: `translate(${-sx * 100}%, ${-sy * 100}%)${rotate ? ` rotate(${rotate}deg)` : ""}`,
    transformOrigin: `${sx * 100}% ${sy * 100}%`,
    color: rgbaCss(textColor),
    opacity: visible ? alpha : 0,
    fontSize: num(p[`sub.${position}.text_fontSize`] ?? g("text_fontSize"), 12),
    fontFamily: font.family,
    textAlign: (String(g("text_justify") ?? "CENTER").toLowerCase() as CSSProperties["textAlign"]) ?? "center",
    width: fixed ? num(g("text_fixedWidth"), 64) : undefined,
    whiteSpace: fixed ? (wrap ? "pre-wrap" : "pre") : "pre",
    overflowWrap: fixed && wrap ? "anywhere" : undefined,
    overflow: fixed && !wrap ? "hidden" : undefined,
    textOverflow: fixed && !wrap ? "ellipsis" : undefined,
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
      {text}
    </span>
  );
}
