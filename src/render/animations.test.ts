import { describe, expect, it } from "vitest";
import {
  advanceLife,
  animationPose,
  animationProgress,
  auraAnimations,
  EASE_FUNCTIONS,
  hideLife,
  hsvTransition,
  lifePose,
  resolveAnimation,
  showLife,
  stampLife,
  type AnimBase,
} from "./animations";
import { regionInfo } from "./region-types";

const base: AnimBase = { alpha: 1, rotation: 0, color: [1, 1, 1, 1] };
const icon = regionInfo("icon").caps;

describe("easing (Types.lua:2740-2754)", () => {
  it("matches the addon's formulas", () => {
    expect(EASE_FUNCTIONS.none(0.3, 3)).toBe(0.3);
    expect(EASE_FUNCTIONS.easeIn(0.5, 3)).toBeCloseTo(0.125);
    expect(EASE_FUNCTIONS.easeOut(0.5, 3)).toBeCloseTo(0.875);
    expect(EASE_FUNCTIONS.easeOutIn(0.25, 2)).toBeCloseTo(0.125);
    expect(EASE_FUNCTIONS.easeOutIn(0.75, 2)).toBeCloseTo(0.875);
  });
});

describe("presets and functions (Prototypes.lua)", () => {
  it("start animations run inverted: Fade In goes from 0 to the region's alpha", () => {
    const fade = resolveAnimation({ type: "preset", preset: "fade" }, "start", icon)!;
    expect(fade.duration).toBe(0.25);
    expect(animationPose(fade, 0, base).alpha).toBe(0);
    expect(animationPose(fade, 1, { ...base, alpha: 0.8 }).alpha).toBeCloseTo(0.8);
  });

  it("Slide from Top starts 50 up; Slide to Top (finish) ends 50 up", () => {
    const start = resolveAnimation({ type: "preset", preset: "slidetop" }, "start", icon)!;
    expect(animationPose(start, 0, base).dy).toBe(50);
    expect(animationPose(start, 1, base).dy).toBe(0);
    const finish = resolveAnimation({ type: "preset", preset: "slidetop" }, "finish", icon)!;
    expect(animationPose(finish, 1, base).dy).toBe(50);
  });

  it("Pulse scales to 1.05 halfway; Shake circles on x (circle2)", () => {
    const pulse = resolveAnimation({ type: "preset", preset: "pulse" }, "main", icon)!;
    expect(animationPose(pulse, 0, base).scaleX).toBeCloseTo(1);
    expect(animationPose(pulse, 0.5, base).scaleX).toBeCloseTo(1.05);
    const shake = resolveAnimation({ type: "preset", preset: "shake" }, "main", icon)!;
    expect(animationPose(shake, 0.25, base).dx).toBeCloseTo(10);
    expect(animationPose(shake, 0, base).dy).toBeCloseTo(0);
  });

  it("Rotate Left turns +360° in 4 s on regions that rotate; icons can't", () => {
    const tex = resolveAnimation({ type: "preset", preset: "rotateCounterClockwise" }, "main", regionInfo("texture").caps)!;
    expect(animationPose(tex, 0.25, { ...base, rotation: 10 }).rotation).toBeCloseTo(100);
    expect(resolveAnimation({ type: "preset", preset: "rotateCounterClockwise" }, "main", icon)!.rotate).toBeUndefined();
    // A custom animation with only an unusable effect isn't one (Animations.lua:214).
    expect(resolveAnimation({ type: "custom", use_rotate: true, rotate: 90 }, "main", icon)).toBeNull();
  });

  it("custom: easing, the chosen function, custom Lua falls back to the normal function", () => {
    const anim = resolveAnimation(
      { type: "custom", duration: "2", use_alpha: true, alpha: 0.5, alphaType: "custom", alphaFunc: "function() end", easeType: "easeIn", easeStrength: 2 },
      "main",
      icon,
    )!;
    expect(anim.duration).toBe(2);
    expect(anim.customCode).toEqual(["alpha"]);
    // eased 0.5 → 0.25; straight: 1 + 0.25 · (0.5 - 1)
    expect(animationPose(anim, 0.5, base).alpha).toBeCloseTo(0.875);
  });

  it("colour: legacy RGB and HSV gradients (shorter hue arc)", () => {
    const rgb = resolveAnimation({ type: "custom", use_color: true, colorR: 0, colorG: 0, colorB: 1, colorA: 1 }, "main", icon)!;
    expect(animationPose(rgb, 0.5, { ...base, color: [1, 0, 0, 1] }).color).toEqual([0.5, 0, 0.5, 1]);
    const [r, g, b] = hsvTransition(0.5, [1, 0, 0, 1], [0, 0, 1, 1]);
    expect([r, g, b].map((v) => +v.toFixed(3))).toEqual([1, 0, 1]);
  });

  it("Bounce (bounceDecay) and Star Shake follow their formulas", () => {
    const bounce = resolveAnimation({ type: "preset", preset: "bounceDecay" }, "finish", icon)!;
    // progress 1/7: prog = 0.5, bounce = 1 → sin(π/2) · 1/4 = 0.25 of 50
    expect(animationPose(bounce, 1 / 7, base).dy).toBeCloseTo(12.5);
  });
});

describe("timing (Animations.lua:15-57 RunAnimation)", () => {
  const anim = resolveAnimation({ type: "custom", duration: 2, use_alpha: true, alpha: 0 }, "start", icon)!;

  it("seconds: elapsed / duration up to 1, then finished; main loops", () => {
    expect(animationProgress(anim, 1, false)).toEqual({ progress: 0.5, finished: false });
    expect(animationProgress(anim, 3, false)).toEqual({ progress: 1, finished: true });
    expect(animationProgress({ ...anim, kind: "main" }, 3, true).progress).toBeCloseTo(0.5);
    expect(animationProgress({ ...anim, duration: 0 }, 0.5, false).progress).toBe(0.5);
  });

  it("relative: the trigger's elapsed share over the duration; without a timer start/finish end at once", () => {
    const rel = { ...anim, kind: "main" as const, durationType: "relative" as const, duration: 0.5 };
    expect(animationProgress(rel, 0, true, { remaining: 45, duration: 60 }).progress).toBeCloseTo(0.5);
    expect(animationProgress({ ...rel, kind: "start" }, 0, false, { duration: 0 }).finished).toBe(true);
  });
});

describe("show/hide lifecycle (RegionPrototype.lua Expand/Collapse)", () => {
  const anims = auraAnimations(
    {
      start: { type: "preset", preset: "fade" },
      main: { type: "preset", preset: "pulse" },
      finish: { type: "custom", duration: 1, use_alpha: true, alpha: 0 },
    },
    "icon",
  );

  it("start → main → (hide) finish → gone", () => {
    let life = stampLife(showLife(anims), 10);
    expect(life.phase).toBe("start");
    expect(lifePose(life, 10, anims, base).pose.alpha).toBe(0);
    life = advanceLife(life, 10.3, anims);
    expect(life.phase).toBe("main");
    expect(life.since).toBe(10.3);
    life = stampLife(hideLife(life, anims), 20);
    expect(life.phase).toBe("finish");
    expect(lifePose(life, 20.5, anims, base).pose.alpha).toBeCloseTo(0.5);
    expect(advanceLife(life, 20.5, anims)).toBe(life);
    expect(advanceLife(life, 21.1, anims).phase).toBe("gone");
  });

  it("without animations: shown is main, hidden is gone", () => {
    const none = auraAnimations(undefined, "icon");
    expect(showLife(none).phase).toBe("main");
    expect(hideLife(showLife(none), none).phase).toBe("gone");
  });
});
