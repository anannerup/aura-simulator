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
  /**
   * Aura triggers: the aura is on the unit. Spell cooldown trigger: the spell is on cooldown. Item Count: the item is
   * in the bags (`stacks` is the count). Any other trigger: what it watches is there (found, on cooldown, enchanted,
   * …); its own show option ("Show On", Inverse) decides whether that makes it active.
   */
  present: boolean;
  /** Seconds left of the aura or of the cooldown. */
  remaining: number;
  /** Full duration in seconds of the aura or cooldown (0 = no duration, e.g. a permanent buff). */
  duration: number;
  /** Aura stacks (applications); for the spell cooldown trigger, charges; for Item Count, the item count. */
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
export type TriggerKind = "secretAura" | "aura2" | "spellCooldown" | "itemCount" | "other";

/** The trigger kinds each game has. */
export const TRIGGER_KINDS: Record<AddonGameId, readonly TriggerKind[]> = {
  forever: ["secretAura", "aura2", "spellCooldown", "itemCount", "other"],
  tbc: ["aura2", "spellCooldown", "itemCount", "other"],
};

function triggerKind(trigger: LuaValue | undefined, game: AddonGameId): TriggerKind {
  if (!isLuaTable(trigger)) return "other";
  const type = getField(trigger, "type");
  // WeakAuras2 has no Aura (Modern) trigger type: on TBC such a trigger is just an unknown one.
  if (type === "secretAura") return game === "forever" ? "secretAura" : "other";
  if (type === "aura2") return "aura2";
  if (type === "spell" && getField(trigger, "event") === "Cooldown Progress (Spell)") return "spellCooldown";
  if (type === "item" && getField(trigger, "event") === "Item Count") return "itemCount";
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

/** The default of one trigger's situation, for the docs: the aura is up, 45 of 60 seconds left, no stacks. */
export const DEFAULT_TRIGGER_SITUATION: Readonly<TriggerSituation> = defaultTriggerSituation;

/** A situation an agent sent that isn't one; the message says what's wrong. */
export class SituationError extends Error {
  override name = "SituationError";
}

const TRIGGER_FIELDS = ["present", "remaining", "duration", "stacks"] as const;
const FACT_FIELDS = ["triggers", "targetExists", "inCombat"] as const;

function readFacts(value: unknown, where: string, base: SituationFacts): SituationFacts {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new SituationError(`${where} must be an object`);
  const v = value as Record<string, unknown>;
  const bool = (key: "targetExists" | "inCombat") => {
    if (v[key] === undefined) return base[key];
    if (typeof v[key] !== "boolean") throw new SituationError(`${where}.${key} must be true or false`);
    return v[key];
  };
  let facts: Situation = { triggers: {}, targetExists: bool("targetExists"), inCombat: bool("inCombat") };
  const triggers = v.triggers ?? {};
  if (typeof triggers !== "object" || triggers === null || Array.isArray(triggers)) {
    throw new SituationError(`${where}.triggers must be an object keyed by trigger number: {"1": {...}}`);
  }
  for (const [key, raw] of Object.entries(triggers)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 1) throw new SituationError(`${where}.triggers: "${key}" is not a trigger number (1, 2, …)`);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new SituationError(`${where}.triggers.${key} must be an object`);
    const t = raw as Record<string, unknown>;
    const patch: Partial<TriggerSituation> = {};
    for (const field of Object.keys(t)) {
      if (!(TRIGGER_FIELDS as readonly string[]).includes(field)) {
        throw new SituationError(`${where}.triggers.${key}.${field} is unknown (known: ${TRIGGER_FIELDS.join(", ")})`);
      }
    }
    if (t.present !== undefined) {
      if (typeof t.present !== "boolean") throw new SituationError(`${where}.triggers.${key}.present must be true or false`);
      patch.present = t.present;
    }
    for (const field of ["remaining", "duration", "stacks"] as const) {
      if (t[field] === undefined) continue;
      if (typeof t[field] !== "number" || !Number.isFinite(t[field]) || t[field] < 0) {
        throw new SituationError(`${where}.triggers.${key}.${field} must be a number of at least 0`);
      }
      patch[field] = t[field];
    }
    // withTrigger keeps time left within the duration (when there is one).
    facts = withTrigger(facts, index, patch);
  }
  return { triggers: facts.triggers, targetExists: facts.targetExists, inCombat: facts.inCombat };
}

/**
 * Reads a situation as agents send it (the push API's situation and `auraSimulator.situation`): JSON
 * `{"targetExists", "inCombat", "triggers": {"1": {"present", "remaining", "duration", "stacks"}}}`. It is a whole
 * situation: what is left out has its default (`DEFAULT_SITUATION`; a trigger's fields `DEFAULT_TRIGGER_SITUATION`).
 * Forever only: `beforeCombat` (the same facts) is the moment combat started, which frozen auras keep; left out, the
 * given facts stand in for it (nothing changed since combat started). Throws a `SituationError` saying what's wrong.
 */
export function readSituation(value: unknown, game: AddonGameId): Situation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new SituationError("The situation must be a JSON object");
  const v = value as Record<string, unknown>;
  const known = game === "forever" ? [...FACT_FIELDS, "beforeCombat"] : FACT_FIELDS;
  for (const key of Object.keys(v)) {
    if (!(known as readonly string[]).includes(key)) {
      const why = key === "beforeCombat" ? " (only Forever has a combat restriction)" : "";
      throw new SituationError(`"${key}" is not part of a situation${why}; known: ${known.join(", ")}`);
    }
  }
  const facts = readFacts(v, "situation", DEFAULT_SITUATION);
  if (v.beforeCombat === undefined || !facts.inCombat) return facts;
  return { ...facts, beforeCombat: { ...readFacts(v.beforeCombat, "situation.beforeCombat", { ...DEFAULT_SITUATION, inCombat: false }), inCombat: false } };
}

/** A situation as JSON (what `readSituation` reads back): trigger numbers as keys, every field written. */
export function situationJson(situation: Situation): Record<string, unknown> {
  const facts = (f: SituationFacts) => ({
    targetExists: f.targetExists,
    inCombat: f.inCombat,
    triggers: Object.fromEntries(Object.entries(f.triggers).map(([k, t]) => [k, { ...t }])),
  });
  return situation.beforeCombat ? { ...facts(situation), beforeCombat: facts(situation.beforeCombat) } : facts(situation);
}
