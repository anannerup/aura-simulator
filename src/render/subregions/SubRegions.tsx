"use client";

import { Fragment, type ReactNode } from "react";
import { getField, isLuaTable, type AuraDocument } from "@/core";
import type { AuraRenderState } from "../conditions";
import { list } from "../conditions/forever-rules";
import type { TextValues } from "../text-format";
import { Border } from "./Border";
import type { SubRegionHost } from "./host";
import { SubGlow } from "./SubGlow";
import { SubText } from "./SubText";
import { Ticks } from "./Ticks";

export type SubRegionKind = "background" | "foreground" | "subtext" | "subborder" | "subtick" | "subglow" | "other";

/**
 * Draw order of a region's parts (WeakAuras.lua:4775-4801 ApplyFrameLevel): every sub-region gets frame level
 * base + its position, and the "subbackground" entry carries the region's own frame (its textures: the icon, the
 * bar's background). On aura bars "subforeground" carries the bar and icon frames (Background.lua:33-59).
 * Higher frame levels draw on top, so DOM order = position order. Regions whose list lacks the entries get them
 * first, as validate's EnforceSubregionExists inserts them at position 1 (RegionPrototype.lua:1334-1348).
 */
export function drawOrder(aura: AuraDocument): { kind: SubRegionKind; position: number }[] {
  const order: { kind: SubRegionKind; position: number }[] = [];
  const entries = list(aura.subRegions);
  const types = entries.map((e) => (isLuaTable(e) ? String(getField(e, "type")) : ""));
  const needsForeground = aura.regionType === "aurabar";
  if (!types.includes("subbackground")) order.push({ kind: "background", position: 0 });
  if (needsForeground && !types.includes("subforeground")) order.push({ kind: "foreground", position: 0 });
  types.forEach((type, i) => {
    const position = i + 1;
    if (type === "subbackground") {
      if (!order.some((o) => o.kind === "background")) order.push({ kind: "background", position });
    } else if (type === "subforeground") {
      if (needsForeground && !order.some((o) => o.kind === "foreground")) order.push({ kind: "foreground", position });
    } else if (type === "subtext" || type === "subborder" || type === "subtick" || type === "subglow") {
      order.push({ kind: type, position });
    } else order.push({ kind: "other", position });
  });
  return order;
}

/**
 * A region's parts and sub-regions in the game's draw order. `background` and `foreground` are the region's
 * own drawing; sub-regions are drawn here. Texture, progress texture, stop motion and model sub-regions are
 * left to ticket 15.
 */
export function SubRegions({
  aura,
  state,
  host,
  values,
  background,
  foreground,
}: {
  aura: AuraDocument;
  state: AuraRenderState;
  host: SubRegionHost;
  values: TextValues;
  background: ReactNode;
  foreground?: ReactNode;
}) {
  const entries = list(aura.subRegions);
  return (
    <>
      {drawOrder(aura).map(({ kind, position }) => {
        const key = `${kind}-${position}`;
        if (kind === "background") return <Fragment key={key}>{background}</Fragment>;
        if (kind === "foreground") return <Fragment key={key}>{foreground}</Fragment>;
        const element = entries[position - 1];
        if (!isLuaTable(element)) return null;
        switch (kind) {
          case "subtext":
            return <SubText key={key} element={element} position={position} state={state} values={values} host={host} />;
          case "subborder":
            return <Border key={key} element={element} position={position} state={state} host={host} />;
          case "subtick":
            return <Ticks key={key} element={element} position={position} state={state} host={host} />;
          case "subglow": {
            const glow = state.glows.find((g) => g.index === position);
            return glow ? <SubGlow key={key} glow={glow} properties={state.properties} host={host} /> : null;
          }
          default:
            return null;
        }
      })}
    </>
  );
}
