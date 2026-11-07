"use client";

import { useEffect, useMemo, useState } from "react";
import { getField, isLuaTable, list, num, type AuraDocument, type AuraRenderState } from "@/core";
import { advanceLife, auraAnimations, GONE, hideLife, lifePose, showLife, stampLife, type AnimBase, type Life } from "./animations";
import { AuraRegion } from "./AuraRegion";
import { RegionClockContext } from "./clock";
import { color } from "./color";
import { regionInfo } from "./region-types";
import { animatedRect, type Rect } from "./screen/geometry";
import { isTimedStopMotion } from "./stop-motion";


/** Stop motion that steps with time (the region or a sub-element) needs the clock even without animations. */
function needsClock(aura: AuraDocument): boolean {
  if (aura.regionType === "stopmotion" && isTimedStopMotion(aura.animationType)) return true;
  return list(aura.subRegions).some((e) => isLuaTable(e) && getField(e, "type") === "substopmotion" && isTimedStopMotion(getField(e, "animationType")));
}

export interface AnimatedAuraRegionProps {
  aura: AuraDocument;
  rect: Rect;
  state: AuraRenderState;
  /** Whether the aura is shown (defaults to `state.shown`). */
  shown?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

/**
 * An aura's region with its display animations (Animations.lua): the start animation when it appears, the main
 * one looping while shown, the finish one when it hides (the region stays until it ends, drawn as it last was).
 * Also ticks the clock stop motion steps on.
 */
export function AnimatedAuraRegion({ aura, rect, state, shown = state.shown, selected, onSelect }: AnimatedAuraRegionProps) {
  const anims = useMemo(() => auraAnimations(aura.animation, aura.regionType), [aura.animation, aura.regionType]);
  const [tracked, setTracked] = useState(shown);
  const [life, setLife] = useState<Life>(() => (shown ? showLife(anims) : GONE));
  const [last, setLast] = useState<{ state: AuraRenderState; rect: Rect } | null>(shown ? { state, rect } : null);
  const [now, setNow] = useState(0);

  // Show/hide (state derived from props during render, so the finish animation starts without a gap).
  if (tracked !== shown) {
    setTracked(shown);
    setLife(shown ? showLife(anims) : hideLife(life, anims));
  }
  if (shown && (last?.state !== state || last.rect !== rect)) setLast({ state, rect });

  const drawn = shown ? { state, rect } : last;
  const dynamic = drawn?.state.dynamic;
  const timerRemaining = dynamic?.remaining;
  const timerDuration = dynamic?.duration ?? 0;
  const clock = needsClock(aura);
  const ticking = life.phase !== "gone" && (life.phase !== "main" || anims.main !== null || clock);

  useEffect(() => {
    if (!ticking) return;
    const timer = { remaining: timerRemaining, duration: timerDuration };
    let frame = 0;
    const tick = () => {
      const t = performance.now() / 1000;
      setNow(t);
      setLife((l) => advanceLife(stampLife(l, t), t, anims, timer));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ticking, anims, timerRemaining, timerDuration]);

  if (life.phase === "gone" || !drawn) return null;

  const p = drawn.state.properties;
  const info = regionInfo(aura.regionType);
  const colorKey = info.colorProperty;
  const base: AnimBase = { alpha: num(p.alpha, 1), rotation: num(p.rotation, 0), color: color(p[colorKey]) };
  const { pose, progress } = lifePose(life, now, anims, base, { remaining: timerRemaining, duration: timerDuration });
  const sx = info.autoSize ? 1 : pose.scaleX;
  const sy = info.autoSize ? 1 : pose.scaleY;
  const animRect = animatedRect(drawn.rect, aura.selfPoint, sx, sy, pose.dx, pose.dy);
  const properties = { ...p };
  if (pose.alpha !== undefined) properties.alpha = pose.alpha;
  if (pose.color) properties[colorKey] = [...pose.color];
  const animState = pose.alpha !== undefined || pose.color ? { ...drawn.state, properties } : drawn.state;
  const seconds = life.shownAt === null ? 0 : Math.max(0, now - life.shownAt);

  return (
    <RegionClockContext.Provider value={seconds}>
      <AuraRegion
        aura={aura}
        rect={animRect}
        state={animState}
        selected={selected}
        onSelect={onSelect}
        scale={[Math.abs(sx), Math.abs(sy)]}
        anim={{ rotation: pose.rotation, mirrorH: sx < 0, mirrorV: sy < 0 }}
        animPhase={phaseLabel(life, anims)}
        animProgress={progress}
      />
    </RegionClockContext.Provider>
  );
}

function phaseLabel(life: Life, anims: ReturnType<typeof auraAnimations>): string {
  if (life.phase === "main" && !anims.main) return "none";
  return life.phase;
}
