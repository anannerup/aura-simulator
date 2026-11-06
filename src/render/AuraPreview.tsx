import type { CSSProperties } from "react";
import type { AuraDocument, LuaValue } from "@/core";
import { evaluateAura, type AuraRenderState } from "./conditions";
import { IconRegion } from "./IconRegion";
import { placeAura, strataZIndex, uiParent, type Rect, type UiParent } from "./screen/geometry";
import type { Situation } from "./situation";
import styles from "./AuraPreview.module.css";

export interface AuraPreviewProps {
  aura: AuraDocument;
  situation: Situation;
  /** UIParent in UI units; the mock screen (`src/render/screen`) scales the whole preview to the window. */
  screen?: UiParent;
}

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

/** Draws an aura on a plain screen at its anchor, offset and size. Pure: props in, markup out. */
const DEFAULT_SCREEN = uiParent({ width: 1920, height: 1080, useUiScale: false, uiScale: 1 });

export function AuraPreview({ aura, situation, screen = DEFAULT_SCREEN }: AuraPreviewProps) {
  const state = evaluateAura(aura, situation);
  const { rect, frame } = placeAura(
    {
      anchorFrameType: aura.anchorFrameType,
      anchorFrameFrame: aura.anchorFrameFrame,
      anchorPoint: aura.anchorPoint,
      selfPoint: aura.selfPoint,
      width: num(aura.width, 64),
      height: num(aura.height, 64),
      xOffset: num(aura.xOffset, 0),
      yOffset: num(aura.yOffset, 0),
    },
    screen,
  );
  return (
    <div className={styles.screen} style={{ width: screen.width, height: screen.height }} data-testid="aura-preview">
      {frame.label && (
        <div
          className={styles.standIn}
          style={{ left: frame.rect.x, top: frame.rect.y, width: frame.rect.width, height: frame.rect.height }}
          data-testid="anchor-stand-in"
        >
          <span className={styles.standInLabel}>{frame.label} (stand-in)</span>
        </div>
      )}
      {state.shown && <AuraRegion aura={aura} rect={rect} state={state} />}
      {state.problem && (
        <p className={styles.problem} data-testid="condition-problem">
          Condition {state.problem.condition}: {state.problem.message}
        </p>
      )}
    </div>
  );
}

export interface AuraRegionProps {
  aura: AuraDocument;
  /** Where the region goes, in UIParent units (`placeAura`, or `group/layout.ts` inside groups). */
  rect: Rect;
  /** The aura's evaluated state for the current situation (`evaluateAura`). */
  state: AuraRenderState;
  /** Marks the selected region (the stage outlines it). */
  selected?: boolean;
  onSelect?: () => void;
}

/** One aura's region at a given rect: the part of the preview the workspace stage repeats for every aura. */
export function AuraRegion({ aura, rect, state, selected, onSelect }: AuraRegionProps) {
  const regionStyle: CSSProperties = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    zIndex: strataZIndex(aura.frameStrata),
    opacity: num(state.properties.alpha, 1),
  };
  const name = typeof aura.id === "string" ? aura.id : "aura";
  return (
    <div
      className={styles.region}
      style={regionStyle}
      data-region-type={String(aura.regionType)}
      data-aura-id={name}
      data-selected={selected ? "true" : undefined}
      data-frozen={state.frozenMarker ? "true" : "false"}
      onClick={onSelect}
    >
      {aura.regionType === "icon" ? (
        <IconRegion aura={aura} state={state} name={name} width={rect.width} height={rect.height} />
      ) : (
        <div className={styles.unsupported}>{String(aura.regionType)}</div>
      )}
    </div>
  );
}
