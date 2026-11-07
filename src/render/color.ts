import type { LuaValue } from "@/core";

export type Rgba = [number, number, number, number];

/** A Lua colour ({r, g, b, a}, 0..1) clamped, with `fallback` for missing channels. */
export function color(value: LuaValue | undefined, fallback: Rgba = [1, 1, 1, 1]): Rgba {
  const c = Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((i) => (typeof c[i] === "number" ? Math.min(1, Math.max(0, c[i] as number)) : fallback[i])) as Rgba;
}
