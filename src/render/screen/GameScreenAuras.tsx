import { useMemo, type CSSProperties } from "react";
import { evaluateAura, type AuraDocument, type AuraRenderState, type ConditionProblem, type LuaValue, type Situation } from "@/core";
import { AnimatedAuraRegion } from "../AnimatedAuraRegion";
import { rgbaCss } from "../color";
import { layoutScreen, type LayoutNode } from "../group/layout";
import { uiParent, type Box, type UiParent } from "./geometry";
import styles from "./GameScreenAuras.module.css";

export interface GameScreenAurasProps {
  /** Every top-level aura of the workspace (groups with their `items`), all drawn at once as in the game. */
  items: LayoutNode[];
  situation: Situation;
  screen?: UiParent;
  /** The selected aura's id: outlined (a group by the box around its shown children). */
  selectedId?: string | null;
  /** Ids of auras hidden in the preview (as if their trigger were inactive). */
  hiddenIds?: ReadonlySet<string>;
  /** The core's verdict on each aura's Aura (Modern) conditions, by aura id (`conditionProblem`). */
  problems?: ReadonlyMap<string, ConditionProblem>;
  onSelect?: (id: string) => void;
}

const DEFAULT_SCREEN = uiParent({ width: 1920, height: 1080, useUiScale: false, uiScale: 1 });

/** CSS of a Lua colour, or `fallback` unless it has at least r, g and b. */
function cssColor(v: LuaValue | undefined, fallback: string): string {
  return Array.isArray(v) && v.length >= 3 && v.every((c) => typeof c === "number") ? rgbaCss(v as number[]) : fallback;
}

/** A group's border and backdrop, approximated with CSS ("Square Full White" edge, flat backdrop colour). */
function borderStyle(aura: AuraDocument, rect: Box, scale: number): CSSProperties {
  const edge = aura.borderEdge !== "None";
  const backdrop = aura.borderBackdrop !== "None";
  const size = (typeof aura.borderSize === "number" ? aura.borderSize : 2) * scale;
  return {
    ...rect,
    border: edge ? `${size}px solid ${cssColor(aura.borderColor, "rgba(0, 0, 0, 1)")}` : undefined,
    background: backdrop ? cssColor(aura.backdropColor, "rgba(255, 255, 255, 0.5)") : undefined,
  };
}

/** Draws every aura of the workspace on the screen, groups laid out like the game does. Pure: props in, markup out. */
export function GameScreenAuras({ items, situation, screen = DEFAULT_SCREEN, selectedId, hiddenIds, problems, onSelect }: GameScreenAurasProps) {
  const { layout, states } = useMemo(() => {
    const states = new Map<AuraDocument, AuraRenderState>();
    const layout = layoutScreen(items, screen, (aura) => {
      const id = typeof aura.id === "string" ? aura.id : undefined;
      const state = evaluateAura(aura, situation, id === undefined ? undefined : problems?.get(id));
      states.set(aura, state);
      return state.shown && !(id !== undefined && hiddenIds?.has(id));
    });
    return { layout, states };
  }, [items, screen, situation, hiddenIds, problems]);
  const selectedGroup = layout.groups.find((g) => g.id === selectedId);
  const selectedAura = layout.auras.find((a) => a.id === selectedId && a.visible);
  const selection = selectedGroup ? (selectedGroup.bounds ?? selectedGroup.frame) : selectedAura?.rect;

  return (
    <div className={styles.screen} style={{ width: screen.width, height: screen.height }} data-testid="aura-preview">
      {layout.standIns.map((frame) => (
        <div key={frame.label} className={styles.standIn} style={frame.rect} data-testid="anchor-stand-in">
          <span className={styles.standInLabel}>{frame.label} (stand-in)</span>
        </div>
      ))}
      {layout.groups.map(
        (g) =>
          g.border && (
            <div key={`border:${g.id}`} className={styles.border} style={borderStyle(g.aura, g.border, g.scale)} data-group-border={g.id} />
          ),
      )}
      {/* Hidden auras stay mounted: their finish animation plays out before they go (AnimatedAuraRegion). */}
      {layout.auras.map((a) => (
        <AnimatedAuraRegion
          key={a.id}
          aura={a.aura}
          rect={a.rect}
          state={states.get(a.aura)!}
          shown={a.visible}
          selected={a.id === selectedId}
          onSelect={onSelect ? () => onSelect(a.id) : undefined}
        />
      ))}
      {selection && (
        <div
          className={styles.selection}
          style={selection}
          data-testid="selection-box"
          data-selected-id={selectedId ?? undefined}
          aria-hidden
        />
      )}
    </div>
  );
}
