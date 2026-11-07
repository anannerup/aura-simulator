/**
 * LibCustomGlow ButtonGlow ("Action Button Glow", glowType buttonOverlay): the Blizzard spell
 * activation alert. Textures from Interface\SpellActivationOverlay\IconAlert(+Ants).
 *
 * WoW animation semantics used here (they're what makes the Lua's numbers line up):
 * - Animations of one order run in parallel, each after its own start delay; the group ends
 *   when the last one ends.
 * - Alpha animations set the alpha absolutely; once started (and after finishing, while the
 *   group still plays) the latest-starting one wins. Before its delay it doesn't apply.
 * - Scale animations multiply (spark: ×1.5 then ×2/3), linear, around the texture centre.
 * - When the group finishes all animation effects are dropped and OnFinished sets the
 *   resting state.
 */
import type { TexCoord } from "@/render/textures";

export const ICON_ALERT = 457293;
export const ICON_ALERT_ANTS = 457294;

export type ButtonGlowPart = "spark" | "innerGlow" | "innerGlowOver" | "outerGlow" | "outerGlowOver" | "ants";

/** Draw order: spark is BACKGROUND, the glows ARTWORK (creation order), ants OVERLAY. */
export const BUTTON_GLOW_PARTS: readonly ButtonGlowPart[] = [
  "spark",
  "innerGlow",
  "innerGlowOver",
  "outerGlow",
  "outerGlowOver",
  "ants",
];

export const BUTTON_GLOW_TEXCOORDS: Record<Exclude<ButtonGlowPart, "ants">, TexCoord> = {
  spark: [0.0078125, 0.6171875, 0.00390625, 0.26953125],
  innerGlow: [0.0078125, 0.5078125, 0.27734375, 0.52734375],
  innerGlowOver: [0.0078125, 0.5078125, 0.53515625, 0.78515625],
  outerGlow: [0.0078125, 0.5078125, 0.27734375, 0.52734375],
  outerGlowOver: [0.0078125, 0.5078125, 0.53515625, 0.78515625],
};

/** Seconds animIn runs (innerGlow fade and ants appear end at 0.3 + 0.2). */
export const ANIM_IN_DURATION = 0.5;
/** Seconds animOut runs (two orders of 0.2). */
const ANIM_OUT_DURATION = 0.4;

interface AlphaAnim {
  target: ButtonGlowPart;
  start: number;
  duration: number;
  /** "a" stands for the colour alpha (updateAlphaAnim). */
  from: number | "a";
  to: number | "a";
}

interface ScaleAnim {
  target: ButtonGlowPart;
  start: number;
  duration: number;
  scale: number;
}

const IN_SCALES: ScaleAnim[] = [
  { target: "spark", start: 0, duration: 0.2, scale: 1.5 },
  { target: "innerGlow", start: 0, duration: 0.3, scale: 2 },
  { target: "innerGlowOver", start: 0, duration: 0.3, scale: 2 },
  { target: "outerGlow", start: 0, duration: 0.3, scale: 0.5 },
  { target: "outerGlowOver", start: 0, duration: 0.3, scale: 0.5 },
  { target: "spark", start: 0.2, duration: 0.2, scale: 2 / 3 },
];

const IN_ALPHAS: AlphaAnim[] = [
  { target: "spark", start: 0, duration: 0.2, from: 0, to: "a" },
  { target: "innerGlowOver", start: 0, duration: 0.3, from: "a", to: 0 },
  { target: "outerGlowOver", start: 0, duration: 0.3, from: "a", to: 0 },
  { target: "spark", start: 0.2, duration: 0.2, from: "a", to: 0 },
  { target: "innerGlow", start: 0.3, duration: 0.2, from: "a", to: 0 },
  { target: "ants", start: 0.3, duration: 0.2, from: 0, to: "a" },
];

// animOut: order 1 runs 0..0.2, order 2 runs 0.2..0.4.
const OUT_ALPHAS: AlphaAnim[] = [
  { target: "outerGlowOver", start: 0, duration: 0.2, from: 0, to: "a" },
  { target: "ants", start: 0, duration: 0.2, from: "a", to: 0 },
  { target: "outerGlowOver", start: 0.2, duration: 0.2, from: "a", to: 0 },
  { target: "outerGlow", start: 0.2, duration: 0.2, from: "a", to: 0 },
];

export interface PartState {
  /** Layout size as a multiple of the glow frame (frame = 1.4 × parent). */
  size: number;
  /** Animation scale (CSS transform around the centre). */
  scale: number;
  alpha: number;
}

export type ButtonGlowState = Record<ButtonGlowPart, PartState>;

/** Frame rect around a parent of width×height: 1.4× and centred. */
export function buttonGlowFrame(width: number, height: number) {
  return { left: -width * 0.2, top: -height * 0.2, width: width * 1.4, height: height * 1.4 };
}

function progress(t: number, start: number, duration: number) {
  return Math.min(1, Math.max(0, (t - start) / duration));
}

function resolve(v: number | "a", a: number) {
  return v === "a" ? a : v;
}

function applyAlphas(state: ButtonGlowState, anims: AlphaAnim[], t: number, a: number) {
  for (const part of BUTTON_GLOW_PARTS) {
    let latest: AlphaAnim | null = null;
    for (const anim of anims) {
      if (anim.target === part && t >= anim.start && (!latest || anim.start >= latest.start)) latest = anim;
    }
    if (latest) {
      const p = progress(t, latest.start, latest.duration);
      const from = resolve(latest.from, a);
      state[part].alpha = from + (resolve(latest.to, a) - from) * p;
    }
  }
}

/** The resting state after animIn (AnimIn_OnFinished). */
function resting(a: number): ButtonGlowState {
  return {
    spark: { size: 1, scale: 1, alpha: 0 },
    innerGlow: { size: 1, scale: 1, alpha: 0 },
    innerGlowOver: { size: 1, scale: 1, alpha: 0 },
    outerGlow: { size: 1, scale: 1, alpha: a },
    outerGlowOver: { size: 1, scale: 1, alpha: 0 },
    ants: { size: 0.85, scale: 1, alpha: a },
  };
}

/**
 * State of each texture `t` seconds after ButtonGlow_Start. `colorAlpha` is color[4], or
 * null when no colour was given (then every alpha is 1).
 */
export function buttonGlowState(t: number, colorAlpha: number | null): ButtonGlowState {
  const a = colorAlpha ?? 1;
  if (t >= ANIM_IN_DURATION) return resting(a);
  // AnimIn_OnPlay
  const state: ButtonGlowState = {
    spark: { size: 1, scale: 1, alpha: colorAlpha === null ? 1 : 0.3 * a },
    innerGlow: { size: 0.5, scale: 1, alpha: a },
    innerGlowOver: { size: 0.5, scale: 1, alpha: a },
    outerGlow: { size: 2, scale: 1, alpha: a },
    outerGlowOver: { size: 2, scale: 1, alpha: a },
    ants: { size: 0.85, scale: 1, alpha: 0 },
  };
  for (const anim of IN_SCALES) {
    if (t < anim.start) continue;
    state[anim.target].scale *= 1 + (anim.scale - 1) * progress(t, anim.start, anim.duration);
  }
  applyAlphas(state, IN_ALPHAS, Math.max(0, t), a);
  return state;
}

/**
 * State `t` seconds after ButtonGlow_Stop on a visible, fully shown glow (animOut).
 * Returns null once animOut finished and the frame is released.
 */
export function buttonGlowOutState(t: number, colorAlpha: number | null): ButtonGlowState | null {
  if (t >= ANIM_OUT_DURATION) return null;
  const a = colorAlpha ?? 1;
  const state = resting(a);
  applyAlphas(state, OUT_ALPHAS, Math.max(0, t), a);
  return state;
}

// --- Ants flipbook: Blizzard's AnimateTexCoords(ants, 256, 256, 48, 48, 22, elapsed, throttle)

const ANTS_FRAMES = 22;
const ANTS_COLUMNS = Math.floor(256 / 48);
const ANTS_CELL = 48 / 256;

export interface AntsAnimator {
  /** Feed one OnUpdate; returns the current frame (1-based), or 0 before the first advance. */
  step(elapsed: number): number;
  readonly frame: number;
}

/**
 * Port of AnimateTexCoords. Frames advance by floor(accumulated / throttle) whenever the
 * accumulated time exceeds the throttle, and the update that advances doesn't count its own
 * elapsed time, so the speed depends on the frame rate exactly as in the game.
 */
export function createAntsAnimator(throttle: number): AntsAnimator {
  let frame = 0; // texture.frame (nil → initialised to 1 on first call)
  let acc = 0; // texture.throttle
  let shown = 0; // frame whose texcoords are set (0: none yet)
  return {
    step(elapsed: number) {
      if (frame === 0) {
        frame = 1;
        acc = throttle;
      }
      if (acc > throttle) {
        const advance = Math.floor(acc / throttle);
        let f = frame;
        while (f + advance > ANTS_FRAMES) f -= ANTS_FRAMES;
        f += advance;
        acc = 0;
        frame = f;
        shown = f;
      } else {
        acc += elapsed;
      }
      return shown;
    },
    get frame() {
      return shown;
    },
  };
}

/**
 * Ants frame after `t` seconds at a steady `fps` (for still renders and tests; the live
 * renderer feeds real frame times to an animator instead).
 */
export function antsFrameAt(t: number, throttle: number, fps = 60): number {
  const animator = createAntsAnimator(throttle);
  const steps = Math.floor(t * fps + 1e-9);
  for (let i = 0; i < steps; i++) animator.step(1 / fps);
  return animator.frame;
}

/** Texcoords AnimateTexCoords sets for a 1-based frame; frame 0 → whole texture (never set). */
export function antsTexCoord(frame: number): TexCoord {
  if (frame <= 0) return [0, 1, 0, 1];
  const left = ((frame - 1) % ANTS_COLUMNS) * ANTS_CELL;
  const bottom = Math.ceil(frame / ANTS_COLUMNS) * ANTS_CELL;
  return [left, left + ANTS_CELL, bottom - ANTS_CELL, bottom];
}
