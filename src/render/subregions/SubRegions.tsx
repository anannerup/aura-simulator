"use client";

import { Fragment, type ReactNode } from "react";
import { getField, isLuaTable, list, type AuraDocument, type AuraRenderState } from "@/core";
import { regionInfo } from "../region-types";
import { textValues } from "../text-format";
import { Border } from "./Border";
import type { SubRegionHost } from "./host";
import { SubGlow } from "./SubGlow";
import { SubText } from "./SubText";
import { SubCircularTexture, SubLinearTexture, SubModel, SubStopMotion, SubTexture } from "./SubTextures";
import { Ticks } from "./Ticks";

const DRAWN = ["subtext", "subborder", "subtick", "subglow", "subtexture", "sublineartexture", "subcirculartexture", "substopmotion", "submodel"] as const;

export type SubRegionKind = "background" | "foreground" | (typeof DRAWN)[number] | "other";

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
  const needsForeground = regionInfo(aura.regionType).foreground;
  if (!types.includes("subbackground")) order.push({ kind: "background", position: 0 });
  if (needsForeground && !types.includes("subforeground")) order.push({ kind: "foreground", position: 0 });
  types.forEach((type, i) => {
    const position = i + 1;
    if (type === "subbackground") {
      if (!order.some((o) => o.kind === "background")) order.push({ kind: "background", position });
    } else if (type === "subforeground") {
      if (needsForeground && !order.some((o) => o.kind === "foreground")) order.push({ kind: "foreground", position });
    } else if ((DRAWN as readonly string[]).includes(type)) {
      order.push({ kind: type as SubRegionKind, position });
    } else order.push({ kind: "other", position });
  });
  return order;
}

/**
 * A region's parts and sub-regions in the game's draw order. `background` and `foreground` are the region's
 * own drawing; sub-regions are drawn here.
 */
export function SubRegions({
  aura,
  state,
  name,
  host,
  background,
  foreground,
}: {
  aura: AuraDocument;
  state: AuraRenderState;
  /** The aura's name, for %n. */
  name: string;
  host: SubRegionHost;
  background: ReactNode;
  foreground?: ReactNode;
}) {
  const entries = list(aura.subRegions);
  const values = textValues(state, name);
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
          case "subtexture":
            return <SubTexture key={key} element={element} position={position} state={state} host={host} />;
          case "sublineartexture":
            return <SubLinearTexture key={key} element={element} position={position} state={state} host={host} />;
          case "subcirculartexture":
            return <SubCircularTexture key={key} element={element} position={position} state={state} host={host} />;
          case "substopmotion":
            return <SubStopMotion key={key} element={element} position={position} state={state} host={host} />;
          case "submodel":
            return <SubModel key={key} element={element} position={position} state={state} host={host} />;
          default:
            return null;
        }
      })}
    </>
  );
}
