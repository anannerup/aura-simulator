/**
 * The game situation a preview is drawn in: what the player would see in the game at one moment.
 *
 * Kept deliberately simple. Each trigger gets one `TriggerSituation` whose meaning depends on the
 * trigger kind (see `triggerKind`): for aura triggers it is the buff or debuff, for the spell cooldown
 * trigger it is the spell's cooldown. Plus two world facts (target exists, in combat).
 *
 * The model is the same in every game. What differs per game is which trigger kinds exist (only Forever's Musca
 * Auras has Aura (Modern)) and whether entering combat records the facts frozen auras keep (only Forever has a
 * combat restriction); the functions for those take the game, "forever" when left out.
 */
import type { AuraDocument } from "../aura-core";
import type { AddonGameId } from "../addon-vm/toc";
import { entries, getField, isLuaTable, type LuaTable, type LuaValue } from "../lua-value";

export interface TriggerSituation {
  /** Aura triggers: the aura is on the unit. Spell cooldown trigger: the spell is on cooldown. */
  present: boolean;
  /** Seconds left of the aura or of the cooldown. */
  remaining: number;
  /** Full duration in seconds of the aura or cooldown (0 = no duration, e.g. a permanent buff). */
  duration: number;
  /** Aura stacks (applications); for the spell cooldown trigger, charges. */
  stacks: number;
}

export interface SituationFacts {
  /** Per trigger number (1-based). Triggers without an entry use `defaultTriggerSituation`. */
  triggers: Record<number, TriggerSituation>;
  targetExists: boolean;
  inCombat: boolean;
}

export interface Situation extends SituationFacts {
  /**
   * Forever only: the situation the moment combat started. Under Forever's combat restriction some triggers and
   * condition properties keep their last out-of-combat value; they read it from here. Set by
   * `setInCombat`; when missing while in combat, the current facts stand in for it. TBC has no combat
   * restriction: its situations never carry it, and its rules never read it.
   */
  beforeCombat?: SituationFacts;
}

const defaultTriggerSituation: TriggerSituation = { present: true, remaining: 45, duration: 60, stacks: 0 };

export const DEFAULT_SITUATION: Situation = { triggers: {}, targetExists: true, inCombat: false };

/** What the situation controls offer for a trigger. `secretAura` (Aura (Modern)) exists only in Forever. */
export type TriggerKind = "secretAura" | "aura2" | "spellCooldown" | "other";

/** The trigger kinds each game has. */
export const TRIGGER_KINDS: Record<AddonGameId, readonly TriggerKind[]> = {
  forever: ["secretAura", "aura2", "spellCooldown", "other"],
  tbc: ["aura2", "spellCooldown", "other"],
};

function triggerKind(trigger: LuaValue | undefined, game: AddonGameId): TriggerKind {
  if (!isLuaTable(trigger)) return "other";
  const type = getField(trigger, "type");
  // WeakAuras2 has no Aura (Modern) trigger type: on TBC such a trigger is just an unknown one.
  if (type === "secretAura") return game === "forever" ? "secretAura" : "other";
  if (type === "aura2") return "aura2";
  if (type === "spell" && getField(trigger, "event") === "Cooldown Progress (Spell)") return "spellCooldown";
  return "other";
}

export interface TriggerInfo {
  /** 1-based trigger number, as conditions refer to it. */
  index: number;
  kind: TriggerKind;
  trigger: LuaTable;
}

/** The aura's triggers in order (`triggers[1..n].trigger`), each with its kind in `game`. */
export function auraTriggers(aura: AuraDocument, game: AddonGameId = "forever"): TriggerInfo[] {
  const triggers = aura.triggers;
  if (!isLuaTable(triggers)) return [];
  const result: TriggerInfo[] = [];
  for (const [key, value] of entries(triggers)) {
    if (typeof key !== "number" || !isLuaTable(value)) continue;
    const trigger = getField(value, "trigger");
    if (!isLuaTable(trigger)) continue;
    result.push({ index: key, kind: triggerKind(trigger, game), trigger });
  }
  return result.sort((a, b) => a.index - b.index);
}

export function triggerSituation(facts: SituationFacts, index: number): TriggerSituation {
  return facts.triggers[index] ?? defaultTriggerSituation;
}

/** Returns a copy with one trigger's situation changed. */
export function withTrigger(situation: Situation, index: number, patch: Partial<TriggerSituation>): Situation {
  const current = triggerSituation(situation, index);
  const next = { ...current, ...patch };
  next.duration = Math.max(0, next.duration);
  next.remaining = Math.min(Math.max(0, next.remaining), next.duration > 0 ? next.duration : next.remaining);
  next.stacks = Math.max(0, Math.round(next.stacks));
  return { ...situation, triggers: { ...situation.triggers, [index]: next } };
}

/**
 * Switches combat on or off. In Forever, entering combat records the facts frozen auras keep (`beforeCombat`); on
 * TBC combat is only a world fact (the "In Combat" condition reads it).
 */
export function setInCombat(situation: Situation, inCombat: boolean, game: AddonGameId = "forever"): Situation {
  if (inCombat === situation.inCombat) return situation;
  const { triggers, targetExists } = situation;
  if (!inCombat || game !== "forever") return { triggers, targetExists, inCombat };
  return { triggers, targetExists, inCombat: true, beforeCombat: { triggers, targetExists, inCombat: false } };
}

/** Forever: the facts frozen state reads: the pre-combat snapshot while in combat, else the current facts. */
export function frozenFacts(situation: Situation): SituationFacts {
  return situation.inCombat ? (situation.beforeCombat ?? { ...situation, inCombat: false }) : situation;
}
