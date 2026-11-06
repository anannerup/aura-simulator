/**
 * LibCustomGlow PixelGlow: N solid lines of WHITE8X8 chasing round the frame. Port of
 * pCalc1/pCalc2/pUpdate. Lines are masked with AM_29 (transparent, clamped to white outside)
 * inset by the thickness, so only a band `th` wide along the frame edge shows; with border
 * on, a 0.1-grey 80% background shows in a band th+1 wide underneath.
 */

type Breakpoints = readonly [number, number, number, number];

function pCalc1(progress: number, s: number, th: number, p: Breakpoints): number {
  let c: number;
  if (progress > p[3] || progress < p[0]) c = 0;
  else if (progress > p[2]) c = s - th - ((progress - p[2]) / (p[3] - p[2])) * (s - th);
  else if (progress > p[1]) c = s - th;
  else c = ((progress - p[0]) / (p[1] - p[0])) * (s - th);
  return Math.floor(c + 0.5);
}

function pCalc2(progress: number, s: number, th: number, p: Breakpoints): number {
  let c: number;
  if (progress > p[3]) c = s - th - ((progress - p[3]) / (p[0] + 1 - p[3])) * (s - th);
  else if (progress > p[2]) c = s - th;
  else if (progress > p[1]) c = ((progress - p[1]) / (p[2] - p[1])) * (s - th);
  else if (progress > p[0]) c = 0;
  else c = s - th - ((progress + 1 - p[3]) / (p[0] + 1 - p[3])) * (s - th);
  return Math.floor(c + 0.5);
}

/** Lua's floored modulo (`x % 1` is always in [0, 1)). */
export function luaMod1(x: number): number {
  return x - Math.floor(x);
}

/** Lap progress after `t` seconds (timer += elapsed/period, wrapped). */
export function pixelProgress(t: number, period: number): number {
  return luaMod1(t / period);
}

export interface LineRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Line rects (CSS px relative to the glow frame's top-left) for frame size width×height.
 * Degenerate rects (width or height ≤ 0) are returned as is; WoW draws nothing for them.
 */
export function pixelGlowLines(
  progress: number,
  width: number,
  height: number,
  thickness: number,
  length: number,
  lines: number,
): LineRect[] {
  const perimeter = 2 * (width + height);
  if (!(perimeter > 0)) return [];
  const half = length / 2;
  const pTLx: Breakpoints = [(height + half) / perimeter, (height + width + half) / perimeter, (2 * height + width - half) / perimeter, 1 - half / perimeter];
  const pTLy: Breakpoints = [(height - half) / perimeter, (height + width + half) / perimeter, (height * 2 + width + half) / perimeter, 1 - half / perimeter];
  const pBRx: Breakpoints = [half / perimeter, (height - half) / perimeter, (height + width - half) / perimeter, (height * 2 + width + half) / perimeter];
  const pBRy: Breakpoints = [half / perimeter, (height + half) / perimeter, (height + width - half) / perimeter, (height * 2 + width - half) / perimeter];
  const th = thickness;
  const step = 1 / lines;
  const out: LineRect[] = [];
  for (let k = 1; k <= lines; k++) {
    const p = luaMod1(progress + step * (k - 1));
    const left = pCalc1(p, width, th, pTLx);
    const top = pCalc2(p, height, th, pTLy);
    const right = th + pCalc2(p, width, th, pBRx);
    const bottom = height - pCalc1(p, height, th, pBRy);
    out.push({ left, top, width: right - left, height: bottom - top });
  }
  return out;
}

/** CSS clip path for the lines' mask: the frame minus the rect inset by `inset`. */
export function bandClipPath(width: number, height: number, inset: number): string {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return `path(evenodd, "M0 0H${r(width)}V${r(height)}H0Z M${r(inset)} ${r(inset)}H${r(width - inset)}V${r(height - inset)}H${r(inset)}Z")`;
}

export const PIXEL_BORDER_COLOR = "rgba(25.5, 25.5, 25.5, 0.8)";
