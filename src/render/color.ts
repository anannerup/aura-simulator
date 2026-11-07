import type { LuaValue } from "@/core";

/** A colour as the addon stores it: [r, g, b, a], each 0..1. */
export type Rgba = readonly [number, number, number, number];

/** A Lua colour ({r, g, b, a}, 0..1) clamped, with `fallback` for missing channels. */
export function color(value: LuaValue | undefined, fallback: Rgba = [1, 1, 1, 1]): Rgba {
  const c = Array.isArray(value) ? value : [];
  const channel = (i: number) => (typeof c[i] === "number" ? Math.min(1, Math.max(0, c[i] as number)) : fallback[i]);
  return [channel(0), channel(1), channel(2), channel(3)];
}

/** CSS `rgba()` of [r, g, b, a?] in 0..1 (alpha defaults to 1). */
export const rgbaCss = ([r, g, b, a = 1]: readonly number[]) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

/** ColorSelect's HSV (h in degrees 0..360, s/v 0..1) from RGB 0..1. */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
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
