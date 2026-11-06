"use client";

import { useEffect, useMemo, useState } from "react";
import { getField, isLuaTable, type AuraDocument, type LuaValue } from "@/core";
import { anchorFraction } from "./anchor";
import { advanceLife, auraAnimations, GONE, hideLife, lifePose, showLife, stampLife, type AnimBase, type Life, type Rgba } from "./animations";
import { AuraRegion } from "./AuraPreview";
import { RegionClockContext } from "./clock";
import type { AuraRenderState } from "./conditions";
import { list } from "./conditions/forever-rules";
import { regionType } from "./regions";
import type { Rect } from "./screen/geometry";
import { isTimedStopMotion } from "./StopMotionRegion";
import { color } from "./subregions/SubText";

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

/** The property a colour animation tints (each region's Color/ColorAnim target). */
export function colorProperty(type: unknown): string {
  if (type === "aurabar") return "barColor";
  if (type === "progresstexture" || type === "stopmotion") return "foregroundColor";
  return "color";
}

/** Stop motion that steps with time (the region or a sub-element) needs the clock even without animations. */
export function needsClock(aura: AuraDocument): boolean {
  if (aura.regionType === "stopmotion" && isTimedStopMotion(aura.animationType)) return true;
  return list(aura.subRegions).some((e) => isLuaTable(e) && getField(e, "type") === "substopmotion" && isTimedStopMotion(getField(e, "animationType")));
}

/** A rect scaled by (sx, sy) about its `selfPoint` (the point the region is pinned by), then moved by (dx, dy) (y up). */
export function animatedRect(rect: Rect, selfPoint: unknown, sx: number, sy: number, dx: number, dy: number): Rect {
  const [fx, fy] = anchorFraction(selfPoint);
  const width = rect.width * Math.abs(sx);
  const height = rect.height * Math.abs(sy);
  return { x: rect.x + rect.width * fx - width * fx + dx, y: rect.y + rect.height * fy - height * fy - dy, width, height };
}

export interface AnimatedAuraRegionProps {
  aura: AuraDocument;
  rect: Rect;
  state: AuraRenderState;
  /** Whether the aura is shown (defaults to `state.shown`). */
  shown?: boolean;
  /** Changing it plays the start animation again (the preview's Replay control). */
  replay?: number;
  selected?: boolean;
  onSelect?: () => void;
}

/**
 * An aura's region with its display animations (Animations.lua): the start animation when it appears, the main
 * one looping while shown, the finish one when it hides (the region stays until it ends, drawn as it last was).
 * Also ticks the clock stop motion steps on.
 */
export function AnimatedAuraRegion({ aura, rect, state, shown = state.shown, replay = 0, selected, onSelect }: AnimatedAuraRegionProps) {
  const anims = useMemo(() => auraAnimations(aura.animation, aura.regionType), [aura.animation, aura.regionType]);
  const [tracked, setTracked] = useState({ shown, replay });
  const [life, setLife] = useState<Life>(() => (shown ? showLife(anims) : GONE));
  const [last, setLast] = useState<{ state: AuraRenderState; rect: Rect } | null>(shown ? { state, rect } : null);
  const [now, setNow] = useState(0);

  // Show/hide/replay (state derived from props during render, so the finish animation starts without a gap).
  if (tracked.shown !== shown || tracked.replay !== replay) {
    setTracked({ shown, replay });
    if (shown !== tracked.shown) setLife(shown ? showLife(anims) : hideLife(life, anims));
    else if (shown) setLife(showLife(anims));
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
  const colorKey = colorProperty(aura.regionType);
  const base: AnimBase = {
    alpha: num(p.alpha, 1),
    rotation: num(p.rotation ?? aura.rotation, 0),
    color: color(p[colorKey] ?? aura[colorKey]) as Rgba,
  };
  const { pose, progress } = lifePose(life, now, anims, base, { remaining: timerRemaining, duration: timerDuration });
  const autoSize = regionType(aura.regionType)?.autoSize === true;
  const sx = autoSize ? 1 : pose.scaleX;
  const sy = autoSize ? 1 : pose.scaleY;
  const animRect = animatedRect(drawn.rect, aura.selfPoint, sx, sy, pose.dx, pose.dy);
  const properties = { ...p };
  if (pose.alpha !== undefined) properties.alpha = pose.alpha;
  if (pose.color) properties[colorKey] = pose.color;
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
