import type { CSSProperties } from "react";
import { num, type AuraDocument, type AuraRenderState } from "@/core";
import { regionInfo, type RegionAnim } from "./region-types";
import { regionRenderer } from "./regions";
import { anchorFraction, strataZIndex, type Box } from "./screen/geometry";
import styles from "./regions.module.css";


export interface AuraRegionProps {
  aura: AuraDocument;
  /** Where the region goes, in UIParent units (`screen/layout.ts`). */
  rect: Box;
  /** The aura's evaluated state for the current situation (`evaluateAura`). */
  state: AuraRenderState;
  /** Marks the selected region (the game screen outlines it). */
  selected?: boolean;
  onSelect?: () => void;
  /** Animation scale of the region's size (Scale), absolute values; the rect is already scaled. */
  scale?: [number, number];
  /** Animation state the region draws itself (`AnimatedAuraRegion`). */
  anim?: RegionAnim;
  /** The running animation phase and its progress, for tests and tools. */
  animPhase?: string;
  animProgress?: number;
}

/** FrozenMarker.lua:52-55: 14 on a big aura, down to 8 on a small one. */
const frozenMarkerSize = (width: number, height: number) => Math.min(14, Math.max(8, 0.4 * Math.min(width, height)));

/** One aura's region at a given rect, with the frozen value padlock over it while it shows. */
export function AuraRegion({ aura, rect, state, selected, onSelect, scale = [1, 1], anim, animPhase, animProgress }: AuraRegionProps) {
  const renderer = regionRenderer(aura.regionType);
  const { autoSize } = regionInfo(aura.regionType);
  const [sx, sy] = anchorFraction(aura.selfPoint);
  const alpha = num(state.properties.alpha, 1);
  const width = num(aura.width, 64) * scale[0];
  const height = num(aura.height, 64) * scale[1];
  // Auto-sized regions (text) are pinned by their selfPoint, which sits where it would on the rect; the content
  // sizes them.
  const regionStyle: CSSProperties = autoSize
    ? { left: rect.left + rect.width * sx, top: rect.top + rect.height * sy, transform: `translate(${-sx * 100}%, ${-sy * 100}%)` }
    : { ...rect };
  // Only an explicit strata or alpha makes the region its own stacking context: that would isolate it, and
  // additively blended parts (sparks, glows) would then add onto nothing instead of onto the screen.
  regionStyle.zIndex = aura.frameStrata === undefined || aura.frameStrata === 1 ? undefined : strataZIndex(aura.frameStrata);
  regionStyle.opacity = alpha < 1 ? alpha : undefined;
  const name = typeof aura.id === "string" ? aura.id : "aura";
  const marker = autoSize ? 8 : frozenMarkerSize(width, height);
  return (
    <div
      className={styles.region}
      style={regionStyle}
      data-region-type={String(aura.regionType)}
      data-aura-id={name}
      data-selected={selected ? "true" : undefined}
      data-frozen={state.frozenMarker ? "true" : "false"}
      data-anim-phase={animPhase}
      data-anim-progress={animProgress === undefined ? undefined : animProgress.toFixed(3)}
      onClick={onSelect}
    >
      {renderer ? (
        <renderer.Region aura={aura} state={state} name={name} width={width} height={height} anim={anim} />
      ) : (
        <div className={styles.unsupported}>{String(aura.regionType)}</div>
      )}
      {state.frozenMarker && <FrozenMarker size={marker} />}
    </div>
  );
}

/** FrozenMarker.lua:30-38: a padlock at the region's top right, offset (2, 2). */
function FrozenMarker({ size }: { size: number }) {
  return (
    <svg className={styles.frozen} width={size} height={size} viewBox="0 0 16 16" style={{ right: -2, top: -2 }} data-testid="frozen-marker" aria-label="Frozen value">
      <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="#d9b45a" strokeWidth="1.8" />
      <rect x="2.5" y="7" width="11" height="8" rx="1.5" fill="#d9b45a" stroke="#4a3510" strokeWidth="0.8" />
      <circle cx="8" cy="10.6" r="1.2" fill="#4a3510" />
    </svg>
  );
}
