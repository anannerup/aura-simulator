/**
 * LibCustomGlow AutoCastGlow ("Autocast Shine", glowType ACShine). Four rings of N sparkles
 * (sizes 7, 6, 5, 4 × scale) run round the frame perimeter, ring k with period×k. Non-retail
 * (WoW Forever) path: texture Interface\ItemSocketingFrame\UI-ItemSockets, desaturated, ADD blend.
 */
import type { TexCoord } from "@/render/textures";
import { luaMod1 } from "./pixelGlow";

export const ITEM_SOCKETS = 136264;
export const SHINE_TEXCOORD: TexCoord = [0.3984375, 0.4453125, 0.40234375, 0.44921875];
const SPARKLE_SIZES = [7, 6, 5, 4] as const;

export interface Sparkle {
  /** Centre, CSS px relative to the glow frame's top-left. */
  x: number;
  y: number;
  size: number;
}

/** Ring timers after `t` seconds (timer[k] += elapsed / (period × k), wrapped). */
export function autoCastTimers(t: number, period: number): [number, number, number, number] {
  return [1, 2, 3, 4].map((k) => luaMod1(t / (period * k))) as [number, number, number, number];
}

/** Sparkle positions in texture order (ring 1 particles 1..N, ring 2, ...). Port of acUpdate. */
export function autoCastSparkles(
  timers: readonly number[],
  width: number,
  height: number,
  particles: number,
  scale: number,
): Sparkle[] {
  if (width * height === 0) return [];
  const perimeter = 2 * (width + height);
  const bottomlim = height * 2 + width;
  const rightlim = height + width;
  const space = perimeter / particles;
  const out: Sparkle[] = [];
  for (let k = 0; k < 4; k++) {
    const size = SPARKLE_SIZES[k] * scale;
    for (let i = 1; i <= particles; i++) {
      const position = luaModulo(space * i + perimeter * timers[k], perimeter);
      let x: number;
      let y: number;
      if (position > bottomlim) {
        // CENTER on BOTTOMRIGHT, x = -position + bottomlim
        x = width - position + bottomlim;
        y = height;
      } else if (position > rightlim) {
        // CENTER on TOPRIGHT, y (up) = -position + rightlim
        x = width;
        y = position - rightlim;
      } else if (position > height) {
        x = position - height;
        y = 0;
      } else {
        // CENTER on BOTTOMLEFT, y (up) = position
        x = 0;
        y = height - position;
      }
      out.push({ x, y, size });
    }
  }
  return out;
}

function luaModulo(a: number, b: number): number {
  return a - Math.floor(a / b) * b;
}
