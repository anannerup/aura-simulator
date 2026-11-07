/**
 * Shards of the exhaustive suites (`npm run test:all`). Vitest runs the files of a run in parallel but the tests of
 * one file one after the other, so a long suite is one file that vitest.config.ts runs as several projects (one per
 * shard, "<suite> <game> <i>/<n>"), each in its own worker. A shard runs every check of the suite that isn't split,
 * on its part of the suite's work: the units (display types, trigger types, auras, …) dealt out by weight, the same
 * way in every shard, so together they cover every unit exactly once.
 */
import { inject } from "vitest";
import type { AddonGameId } from "@/core";

export interface Shard {
  /** 0-based. */
  index: number;
  count: number;
  /** The game this shard runs (the suite runs every game when unset). */
  game?: AddonGameId;
}

declare module "vitest" {
  export interface ProvidedContext {
    shard: Shard;
  }
}

/** This file's shard: the one its project provides, or the whole suite (a single shard) when run on its own. */
export function currentShard(): Shard {
  return inject("shard") ?? { index: 0, count: 1 };
}

/** Whether the suite runs `game` in this shard. */
export const runsGame = (shard: Shard, game: AddonGameId) => shard.game === undefined || shard.game === game;

/** The shard that runs the suite's checks that aren't split (the first). */
export const isFirstShard = (shard: Shard) => shard.index === 0;

/**
 * This shard's units: all units dealt out heaviest first, each to the shard with the least weight so far (ties: the
 * lower index), so every shard computes the same split and the shards' weights stay close.
 */
export function shardUnits<T>(units: T[], weight: (unit: T) => number, shard: Shard): T[] {
  const loads = new Array<number>(shard.count).fill(0);
  const mine: T[] = [];
  const order = units.map((unit, i) => ({ unit, i, w: weight(unit) })).sort((a, b) => b.w - a.w || a.i - b.i);
  for (const { unit, w } of order) {
    const to = loads.indexOf(Math.min(...loads));
    loads[to] += w;
    if (to === shard.index) mine.push(unit);
  }
  // In the suite's own order.
  return units.filter((u) => mine.includes(u));
}
