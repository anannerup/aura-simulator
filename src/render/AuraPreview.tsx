import type { CSSProperties } from "react";
import type { AuraDocument, LuaValue } from "@/core";
import { placeRegion } from "./anchor";
import { evaluateAura } from "./conditions";
import { IconRegion } from "./IconRegion";
import type { Situation } from "./situation";
import styles from "./AuraPreview.module.css";

export interface AuraPreviewProps {
  aura: AuraDocument;
  situation: Situation;
  /** Size of the drawn screen in UI units (1 unit = 1 CSS pixel for now; ticket 14 adds scale). */
  screen?: { width: number; height: number };
}

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

/** Draws an aura on a plain screen at its anchor, offset and size. Pure: props in, markup out. */
export function AuraPreview({ aura, situation, screen = { width: 800, height: 450 } }: AuraPreviewProps) {
  const width = num(aura.width, 64);
  const height = num(aura.height, 64);
  const { left, top } = placeRegion(screen, {
    width,
    height,
    anchorPoint: aura.anchorPoint,
    selfPoint: aura.selfPoint,
    xOffset: num(aura.xOffset, 0),
    yOffset: num(aura.yOffset, 0),
  });
  const state = evaluateAura(aura, situation);
  const regionStyle: CSSProperties = { left, top, width, height, opacity: num(state.properties.alpha, 1) };
  const name = typeof aura.id === "string" ? aura.id : "aura";

  return (
    <div className={styles.screen} style={{ width: screen.width, height: screen.height }} data-testid="aura-preview">
      {state.shown && (
        <div
          className={styles.region}
          style={regionStyle}
          data-region-type={String(aura.regionType)}
          data-frozen={state.frozenMarker ? "true" : "false"}
        >
          {aura.regionType === "icon" ? (
            <IconRegion aura={aura} state={state} name={name} width={width} height={height} />
          ) : (
            <div className={styles.unsupported}>{String(aura.regionType)}</div>
          )}
        </div>
      )}
      {state.problem && (
        <p className={styles.problem} data-testid="condition-problem">
          Condition {state.problem.condition}: {state.problem.message}
        </p>
      )}
    </div>
  );
}
