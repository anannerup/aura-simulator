"use client";

import type { CSSProperties } from "react";
import type { AuraDocument, LuaValue } from "@/core";
import type { AuraRenderState } from "./conditions";
import { frozenMarkerSize } from "./conditions/forever-rules";
import { FrozenMarker, textValues } from "./IconRegion";
import { regionHost } from "./subregions/host";
import { SubRegions } from "./subregions/SubRegions";
import styles from "./AuraPreview.module.css";

/** What a model shows, as text: a unit's model, or the model file (FileDataID or path). Model.lua:12, 137-160. */
export function modelLabel(element: { model_fileId?: LuaValue; modelIsUnit?: LuaValue; model_path?: LuaValue }, fallbackId: string): string {
  const id = element.model_fileId ?? element.model_path ?? fallbackId;
  if (element.modelIsUnit === true) return `Unit model: ${String(id)}`;
  return typeof id === "number" || /^\d+$/.test(String(id)) ? `Model file ${String(id)}` : `Model ${String(id)}`;
}

/** A model the preview doesn't draw in 3D: a labelled box where it would be. */
export function ModelPlaceholder({ label, testId, style }: { label: string; testId: string; style?: CSSProperties }) {
  return (
    <div className={styles.modelPlaceholder} style={style} data-testid={testId} title={label}>
      <span className={styles.placeholderLabel}>{label}</span>
    </div>
  );
}

/** The model region (RegionTypes/Model.lua): a 3D model, shown as a labelled placeholder (no 3D in the preview). */
export function ModelRegion({ aura, state, name, width, height }: { aura: AuraDocument; state: AuraRenderState; name: string; width: number; height: number }) {
  const background = <ModelPlaceholder label={modelLabel(aura, "122968")} testId="model-placeholder" style={{ inset: 0 }} />;
  return (
    <div className={styles.barFrame}>
      <SubRegions aura={aura} state={state} host={regionHost("model", width, height)} values={textValues(state, name)} background={background} />
      {state.frozenMarker && <FrozenMarker size={frozenMarkerSize(width, height)} />}
    </div>
  );
}

/** The empty region (RegionTypes/Empty.lua): no drawing of its own, only its sub-elements. */
export function EmptyRegion({ aura, state, name, width, height }: { aura: AuraDocument; state: AuraRenderState; name: string; width: number; height: number }) {
  return (
    <div className={styles.barFrame} data-testid="empty-region">
      <SubRegions aura={aura} state={state} host={regionHost("empty", width, height)} values={textValues(state, name)} background={null} />
      {state.frozenMarker && <FrozenMarker size={frozenMarkerSize(width, height)} />}
    </div>
  );
}
