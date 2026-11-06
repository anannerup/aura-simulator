/**
 * Display animations (Animations.lua, Musca Auras v1.15.0): the start, main and finish animation of an aura,
 * presets (Prototypes.lua:483-692 anim_presets), the built-in functions (Prototypes.lua:278-480
 * anim_function_strings) and easing (Types.lua:2740-2754 anim_ease_functions). Pure; no React.
 *
 * Custom Lua functions (`*Type = "custom"`) can't run in the preview: they fall back to the type's normal
 * function and are listed in `customCode`.
 */
import { getField, isLuaTable, type LuaValue } from "@/core";

export type Rgba = [number, number, number, number];
export type AnimKind = "start" | "main" | "finish";

// ---------------------------------------------------------------------------------------------------------------
// Easing (Types.lua:2740-2754)

export const EASE_FUNCTIONS: Record<string, (p: number, power: number) => number> = {
  none: (p) => p,
  easeIn: (p, power) => p ** power,
  easeOut: (p, power) => 1 - (1 - p) ** power,
  easeOutIn: (p, power) => (p < 0.5 ? (p * 2) ** power * 0.5 : 1 - ((1 - p) * 2) ** power * 0.5),
};

// ---------------------------------------------------------------------------------------------------------------
// Built-in functions (Prototypes.lua:278-480)

type Fn2 = (p: number, sx: number, sy: number, dx: number, dy: number) => [number, number];
type Fn1 = (p: number, start: number, delta: number) => number;
type FnColor = (p: number, from: Rgba, to: Rgba) => Rgba;

export const TRANSLATE_FUNCTIONS: Record<string, Fn2> = {
  straightTranslate: (p, sx, sy, dx, dy) => [sx + p * dx, sy + p * dy],
  circle: (p, sx, sy, dx, dy) => {
    const a = p * 2 * Math.PI;
    return [sx + dx * Math.cos(a), sy + dy * Math.sin(a)];
  },
  circle2: (p, sx, sy, dx, dy) => {
    const a = p * 2 * Math.PI;
    return [sx + dx * Math.sin(a), sy + dy * Math.cos(a)];
  },
  spiral: (p, sx, sy, dx, dy) => {
    const a = p * 2 * Math.PI;
    return [sx + p * dx * Math.cos(a), sy + p * dy * Math.sin(a)];
  },
  spiralandpulse: (p, sx, sy, dx, dy) => {
    const a = (p + 0.25) * 2 * Math.PI;
    return [sx + Math.cos(a) * dx * Math.cos(a * 2), sy + Math.abs(Math.cos(a)) * dy * Math.sin(a * 2)];
  },
  shake: (p, sx, sy, dx, dy) => {
    const prog = p < 0.25 ? p * 4 : p < 0.75 ? 2 - p * 4 : (p - 1) * 4;
    return [sx + prog * dx, sy + prog * dy];
  },
  starShakeDecay: (p, _sx, _sy, dx, dy) => {
    const spokes = 10;
    const fullCircles = 4;
    const r = Math.min(Math.abs(dx), Math.abs(dy));
    const xScale = dx / r;
    const yScale = dy / r;
    const deltaAngle = ((fullCircles * 2) / spokes) * Math.PI;
    let q = p * spokes;
    const i1 = Math.floor(q);
    q -= i1;
    const a1 = i1 * deltaAngle;
    const a2 = a1 + deltaAngle;
    const x = q * r * Math.cos(a2) + (1 - q) * r * Math.cos(a1);
    const y = q * r * Math.sin(a2) + (1 - q) * r * Math.sin(a1);
    const ease = Math.sin((p * Math.PI) / 2);
    // Note: the addon ignores the start position here.
    return [ease * x * xScale, ease * y * yScale];
  },
  bounceDecay: (p, sx, sy, dx, dy) => {
    const prog = (p * 3.5) % 1;
    const bounce = Math.ceil(p * 3.5);
    const d = Math.sin(prog * Math.PI) * (bounce / 4);
    return [sx + d * dx, sy + d * dy];
  },
  bounce: (p, sx, sy, dx, dy) => {
    const d = Math.sin(p * Math.PI);
    return [sx + d * dx, sy + d * dy];
  },
};

export const SCALE_FUNCTIONS: Record<string, Fn2> = {
  straightScale: (p, sx, sy, x, y) => [sx + p * (x - sx), sy + p * (y - sy)],
  pulse: (p, sx, sy, x, y) => {
    const a = p * 2 * Math.PI - Math.PI / 2;
    const k = (Math.sin(a) + 1) / 2;
    return [sx + k * (x - 1), sy + k * (y - 1)];
  },
  fauxspin: (p, _sx, sy, x, y) => [Math.cos(p * 2 * Math.PI) * x, sy + p * (y - sy)],
  fauxflip: (p, sx, _sy, x, y) => [sx + p * (x - sx), Math.cos(p * 2 * Math.PI) * y],
};

const backandforth: Fn1 = (p, start, delta) => start + (p < 0.25 ? p * 4 : p < 0.75 ? 2 - p * 4 : (p - 1) * 4) * delta;

export const ALPHA_FUNCTIONS: Record<string, Fn1> = {
  straight: (p, start, delta) => start + p * delta,
  alphaPulse: (p, start, delta) => start + ((Math.sin(p * 2 * Math.PI - Math.PI / 2) + 1) / 2) * delta,
  flash: (p, start, delta) => start + (p < 0.5 ? p * 2 : (p - 1) * 2) * delta,
  hide: () => 0,
};

export const ROTATE_FUNCTIONS: Record<string, Fn1> = {
  straight: (p, start, delta) => start + p * delta,
  backandforth,
  wobble: (p, start, delta) => start + Math.sin(p * 2 * Math.PI) * delta,
};

const lerpColor = (k: number, a: Rgba, b: Rgba): Rgba => [0, 1, 2, 3].map((i) => a[i] + k * (b[i] - a[i])) as Rgba;
const pulseK = (p: number) => (Math.sin(p * 2 * Math.PI - Math.PI / 2) + 1) / 2;

/** ColorSelect's HSV (h in degrees). */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max === 0 ? 0 : d / max, max];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = v - c;
  return [r + m, g + m, b + m];
}

/** Prototypes.lua:249-275 WeakAuras.GetHSVTransition: hue along the shorter arc, saturation/value/alpha linear. */
export function hsvTransition(perc: number, from: Rgba, to: Rgba): Rgba {
  const [h1, s1, v1] = rgbToHsv(from[0], from[1], from[2]);
  const [h2, s2, v2] = rgbToHsv(to[0], to[1], to[2]);
  let diff = h2 - h1;
  if (diff < -180) diff += 360;
  else if (diff > 180) diff -= 360;
  const h3 = (((h1 + perc * diff) % 360) + 360) % 360;
  const [r, g, b] = hsvToRgb(h3, s1 - (s1 - s2) * perc, v1 - (v1 - v2) * perc);
  return [r, g, b, from[3] - (from[3] - to[3]) * perc];
}

export const COLOR_FUNCTIONS: Record<string, FnColor> = {
  straightColor: (p, a, b) => lerpColor(p, a, b),
  straightHSV: (p, a, b) => hsvTransition(p, a, b),
  pulseColor: (p, a, b) => lerpColor(pulseK(p), a, b),
  pulseHSV: (p, a, b) => hsvTransition(pulseK(p), a, b),
};

// ---------------------------------------------------------------------------------------------------------------
// Presets (Prototypes.lua:483-692)

type Raw = Record<string, LuaValue>;

export const ANIM_PRESETS: Record<string, Raw> = {
  slidetop: { type: "custom", duration: 0.25, use_translate: true, x: 0, y: 50, use_alpha: true, alpha: 0 },
  slideleft: { type: "custom", duration: 0.25, use_translate: true, x: -50, y: 0, use_alpha: true, alpha: 0 },
  slideright: { type: "custom", duration: 0.25, use_translate: true, x: 50, y: 0, use_alpha: true, alpha: 0 },
  slidebottom: { type: "custom", duration: 0.25, use_translate: true, x: 0, y: -50, use_alpha: true, alpha: 0 },
  fade: { type: "custom", duration: 0.25, use_alpha: true, alpha: 0 },
  grow: { type: "custom", duration: 0.25, use_scale: true, scalex: 2, scaley: 2, use_alpha: true, alpha: 0 },
  shrink: { type: "custom", duration: 0.25, use_scale: true, scalex: 0, scaley: 0, use_alpha: true, alpha: 0 },
  spiral: { type: "custom", duration: 0.5, use_translate: true, x: 100, y: 100, translateType: "spiral", use_alpha: true, alpha: 0 },
  bounceDecay: { type: "custom", duration: 1.5, use_translate: true, x: 50, y: 50, translateType: "bounceDecay", use_alpha: true, alpha: 0 },
  starShakeDecay: { type: "custom", duration: 1, use_translate: true, x: 50, y: 50, translateType: "starShakeDecay", use_alpha: true, alpha: 0 },
  shake: { type: "custom", duration: 0.5, use_translate: true, x: 10, y: 0, translateType: "circle2" },
  spin: { type: "custom", duration: 1, use_scale: true, scalex: 1, scaley: 1, scaleType: "fauxspin" },
  flip: { type: "custom", duration: 1, use_scale: true, scalex: 1, scaley: 1, scaleType: "fauxflip" },
  wobble: { type: "custom", duration: 0.5, use_rotate: true, rotate: 3, rotateType: "wobble" },
  pulse: { type: "custom", duration: 0.75, use_scale: true, scalex: 1.05, scaley: 1.05, scaleType: "pulse" },
  alphaPulse: { type: "custom", duration: 0.5, use_alpha: true, alpha: 0.5, alphaType: "alphaPulse" },
  rotateClockwise: { type: "custom", duration: 4, use_rotate: true, rotate: -360 },
  rotateCounterClockwise: { type: "custom", duration: 4, use_rotate: true, rotate: 360 },
  spiralandpulse: { type: "custom", duration: 6, use_translate: true, x: 100, y: 100, translateType: "spiralandpulse" },
  circle: { type: "custom", duration: 4, use_translate: true, x: 100, y: 100, translateType: "circle" },
  orbit: { type: "custom", duration: 4, use_translate: true, x: 100, y: 100, translateType: "circle", use_rotate: true, rotate: 360 },
  bounce: { type: "custom", duration: 0.6, use_translate: true, x: 0, y: 25, translateType: "bounce" },
};

// ---------------------------------------------------------------------------------------------------------------
// Resolution (Animations.lua:211-415 Animate)

/** What a region type can do (RegionTypes/*.lua: Scale, SetAnimRotation, ColorAnim). */
export interface RegionCaps {
  scale: boolean;
  rotate: boolean;
  color: boolean;
}

export function regionCaps(regionType: unknown): RegionCaps {
  const t = String(regionType);
  return {
    scale: ["icon", "aurabar", "texture", "progresstexture", "stopmotion", "model"].includes(t),
    rotate: ["texture", "progresstexture", "model"].includes(t),
    color: ["icon", "aurabar", "text", "texture", "progresstexture", "stopmotion"].includes(t),
  };
}

export interface AnimSpec {
  kind: AnimKind;
  /** Seconds (or share of the trigger's duration for "relative"). */
  duration: number;
  durationType: "seconds" | "relative";
  ease: string;
  easeStrength: number;
  translate?: { fn: Fn2; x: number; y: number };
  alpha?: { fn: Fn1; alpha: number };
  scale?: { fn: Fn2; x: number; y: number };
  rotate?: { fn: Fn1; delta: number };
  color?: { fn: FnColor; to: Rgba };
  /** Function types the preview can't run (custom Lua), drawn with the normal function instead. */
  customCode: string[];
  /** The preset name, when it is one. */
  preset?: string;
}

const numOr = (v: LuaValue | undefined, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

function pick<T>(table: Record<string, T>, type: LuaValue | undefined, fallback: string, label: string, custom: string[]): T {
  const name = typeof type === "string" ? type : fallback;
  if (name === "custom") custom.push(label);
  return table[name] ?? table[fallback];
}

/**
 * The animation an aura's `animation.<kind>` entry plays on a region of `caps`, or null when there is none
 * (Animations.lua:214-219: a custom animation needs at least one usable effect, a preset must exist).
 */
export function resolveAnimation(raw: LuaValue | undefined, kind: AnimKind, caps: RegionCaps): AnimSpec | null {
  if (!isLuaTable(raw) || Array.isArray(raw)) return null;
  const g = (k: string) => getField(raw, k);
  let anim: Raw;
  let preset: string | undefined;
  if (g("type") === "preset") {
    preset = String(g("preset"));
    if (!(preset in ANIM_PRESETS)) return null;
    anim = ANIM_PRESETS[preset];
  } else if (g("type") === "custom") {
    anim = raw as Raw;
    const usable = anim.use_translate || anim.use_alpha || (anim.use_scale && caps.scale) || (anim.use_rotate && caps.rotate) || (anim.use_color && caps.color);
    if (!usable) return null;
  } else return null;
  const custom: string[] = [];
  const spec: AnimSpec = {
    kind,
    duration: numOr(anim.duration, 0),
    durationType: anim.duration_type === "relative" ? "relative" : "seconds",
    ease: typeof anim.easeType === "string" && anim.easeType in EASE_FUNCTIONS ? anim.easeType : "none",
    easeStrength: numOr(anim.easeStrength, 3),
    customCode: custom,
    preset,
  };
  if (anim.use_translate) {
    spec.translate = { fn: pick(TRANSLATE_FUNCTIONS, anim.translateType, "straightTranslate", "translate", custom), x: numOr(anim.x, 0), y: numOr(anim.y, 0) };
  }
  if (anim.use_alpha) spec.alpha = { fn: pick(ALPHA_FUNCTIONS, anim.alphaType, "straight", "alpha", custom), alpha: numOr(anim.alpha, 0) };
  // Without Scale the addon resizes the frame (Animations.lua:90-95): the preview does the same for every region.
  if (anim.use_scale) spec.scale = { fn: pick(SCALE_FUNCTIONS, anim.scaleType, "straightScale", "scale", custom), x: numOr(anim.scalex, 1), y: numOr(anim.scaley, 1) };
  if (anim.use_rotate && caps.rotate) spec.rotate = { fn: pick(ROTATE_FUNCTIONS, anim.rotateType, "straight", "rotate", custom), delta: numOr(anim.rotate, 0) };
  if (anim.use_color && caps.color) {
    spec.color = {
      fn: pick(COLOR_FUNCTIONS, anim.colorType, "straightColor", "color", custom),
      to: [numOr(anim.colorR, 1), numOr(anim.colorG, 1), numOr(anim.colorB, 1), numOr(anim.colorA, 1)],
    };
  }
  return spec;
}

export interface AuraAnimations {
  start: AnimSpec | null;
  main: AnimSpec | null;
  finish: AnimSpec | null;
}

export function auraAnimations(animation: LuaValue | undefined, regionType: unknown): AuraAnimations {
  const caps = regionCaps(regionType);
  const entry = (k: AnimKind) => (isLuaTable(animation) ? getField(animation, k) : undefined);
  return { start: resolveAnimation(entry("start"), "start", caps), main: resolveAnimation(entry("main"), "main", caps), finish: resolveAnimation(entry("finish"), "finish", caps) };
}

// ---------------------------------------------------------------------------------------------------------------
// Playback (Animations.lua:15-165 RunAnimation)

/** The trigger's timer, for "relative" durations. */
export interface AnimTimer {
  remaining?: number;
  duration: number;
}

/**
 * The raw animation progress `seconds` into the animation, and whether it has run out. Seconds: progress grows by
 * elapsed / duration (a duration of 0 counts as 1 s) and stops at 1; a looping (main) animation starts over
 * (Animations.lua:157-159). Relative: elapsed share of the trigger's timer / duration, unbounded (the addon
 * doesn't wrap it); a start or finish animation without a timer ends at once (:30-36). The preview's timer
 * stands still, so a relative start/finish animation also ends at once.
 */
export function animationProgress(spec: AnimSpec, seconds: number, loop: boolean, timer?: AnimTimer): { progress: number; finished: boolean } {
  if (spec.durationType === "relative") {
    const running = timer && timer.duration >= 0.01 && timer.remaining !== undefined;
    if (!running) return { progress: 0, finished: spec.kind !== "main" };
    const relative = 1 - timer.remaining! / timer.duration;
    return { progress: spec.duration > 0 ? relative / spec.duration : 0, finished: spec.kind !== "main" };
  }
  const period = spec.duration > 0 ? spec.duration : 1;
  if (loop) return { progress: (seconds % period) / period, finished: false };
  const progress = seconds / period;
  return progress >= 1 ? { progress: 1, finished: true } : { progress: Math.max(0, progress), finished: false };
}

/** What the region looks like before the animation: its alpha, base rotation and colour. */
export interface AnimBase {
  alpha: number;
  rotation: number;
  color: Rgba;
}

/** The animated changes to a region: offset (UI units, y up), alpha, scale, rotation (degrees), colour. */
export interface AnimPose {
  dx: number;
  dy: number;
  alpha?: number;
  scaleX: number;
  scaleY: number;
  rotation?: number;
  color?: Rgba;
}

export const REST_POSE: AnimPose = { dx: 0, dy: 0, scaleX: 1, scaleY: 1 };

/**
 * One frame of an animation (Animations.lua:58-124): progress inverted for start animations (Animate is called with
 * inverse = true, RegionPrototype.lua:1207/1274), then eased, then fed to each function.
 */
export function animationPose(spec: AnimSpec, rawProgress: number, base: AnimBase): AnimPose {
  const inverse = spec.kind === "start";
  const p = EASE_FUNCTIONS[spec.ease](inverse ? 1 - rawProgress : rawProgress, spec.easeStrength);
  const pose: AnimPose = { ...REST_POSE };
  if (spec.translate) [pose.dx, pose.dy] = spec.translate.fn(p, 0, 0, spec.translate.x, spec.translate.y);
  if (spec.alpha) pose.alpha = Math.min(1, Math.max(0, spec.alpha.fn(p, base.alpha, spec.alpha.alpha - base.alpha)));
  if (spec.scale) [pose.scaleX, pose.scaleY] = spec.scale.fn(p, 1, 1, spec.scale.x, spec.scale.y);
  if (spec.rotate) pose.rotation = spec.rotate.fn(p, base.rotation, spec.rotate.delta);
  if (spec.color) pose.color = spec.color.fn(p, base.color, spec.color.to);
  return pose;
}

// ---------------------------------------------------------------------------------------------------------------
// Show/hide lifecycle (RegionPrototype.lua:1070-1290 Expand/Collapse)

/**
 * Where a region is in its show/hide cycle. Expand plays the start animation, then the main one loops
 * (startMainAnimation as the start's onFinished, RegionPrototype.lua:1076-1078, 1274). Collapse plays the finish
 * animation and hides the region only when it ends (hideRegion as onFinished, :1222). Showing again during the
 * finish animation replaces it with the start animation (Animations.lua:223-226: a different type replaces).
 */
export type Phase = "start" | "main" | "finish" | "gone";

export interface Life {
  phase: Phase;
  /** When the phase began (seconds, the page clock); null until the first tick stamps it. */
  since: number | null;
  /** When the region was shown (its PreShow; stop motion counts from here). */
  shownAt: number | null;
}

export const GONE: Life = { phase: "gone", since: null, shownAt: null };

export function showLife(anims: AuraAnimations): Life {
  return { phase: anims.start ? "start" : "main", since: null, shownAt: null };
}

export function hideLife(life: Life, anims: AuraAnimations): Life {
  if (life.phase === "gone" || !anims.finish) return GONE;
  return { phase: "finish", since: null, shownAt: life.shownAt };
}

/** Fills in the times of a phase that just began. */
export function stampLife(life: Life, now: number): Life {
  if (life.phase === "gone" || (life.since !== null && life.shownAt !== null)) return life;
  return { ...life, since: life.since ?? now, shownAt: life.shownAt ?? now };
}

export function phaseSpec(life: Life, anims: AuraAnimations): AnimSpec | null {
  return life.phase === "start" ? anims.start : life.phase === "main" ? anims.main : life.phase === "finish" ? anims.finish : null;
}

/** Moves on when the start or finish animation has run out. Returns `life` itself when nothing changes. */
export function advanceLife(life: Life, now: number, anims: AuraAnimations, timer?: AnimTimer): Life {
  if (life.since === null || (life.phase !== "start" && life.phase !== "finish")) return life;
  const spec = phaseSpec(life, anims);
  const done = !spec || animationProgress(spec, now - life.since, false, timer).finished;
  if (!done) return life;
  return life.phase === "start" ? { phase: "main", since: now, shownAt: life.shownAt } : GONE;
}

/** The pose at `now`: the running phase's animation, or rest. */
export function lifePose(life: Life, now: number, anims: AuraAnimations, base: AnimBase, timer?: AnimTimer): { pose: AnimPose; progress: number } {
  const spec = phaseSpec(life, anims);
  if (!spec) return { pose: REST_POSE, progress: 0 };
  const seconds = life.since === null ? 0 : Math.max(0, now - life.since);
  const { progress } = animationProgress(spec, seconds, life.phase === "main", timer);
  return { pose: animationPose(spec, progress, base), progress };
}
