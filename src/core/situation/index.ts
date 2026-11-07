/**
 * The game situation a preview is drawn in: what the player would see in the game at one moment.
 *
 * Kept deliberately simple. Each trigger gets one `TriggerSituation` whose meaning depends on the
 * trigger kind (see `triggerKind`): for aura triggers it is the buff or debuff, for the spell cooldown
 * trigger it is the spell's cooldown. Plus two world facts (target exists, in combat). Triggers are numbered per aura,
 * so the workspace-wide triggers are what every aura sees by default, and `auras` overrides them for single auras (by
 * aura id): four item count icons can show 8, 5, 1 and 12 side by side. Each aura evaluates in `situationForAura`.
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

/** One aura's own triggers, over the workspace-wide ones. */
export interface AuraSituation {
  /** Per trigger number: replaces the workspace-wide entry for that number, for this aura only. */
  triggers: Record<number, TriggerSituation>;
}

export interface SituationFacts {
  /** Per trigger number (1-based). Triggers without an entry report their default (`defaultTriggerSituation`). */
  triggers: Record<number, TriggerSituation>;
  targetExists: boolean;
  inCombat: boolean;
  /** Per aura id: that aura's own triggers (left out: every aura sees `triggers`). */
  auras?: Record<string, AuraSituation>;
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

const GENERIC_DEFAULT: TriggerSituation = { present: true, remaining: 45, duration: 60, stacks: 0 };

export const DEFAULT_SITUATION: Situation = { triggers: {}, targetExists: true, inCombat: false };

/**
 * What the situation controls offer for a trigger. `secretAura` (Aura (Modern)) exists only in Forever; `custom` is a
 * Custom trigger, whose state comes from its code.
 */
export type TriggerKind = "secretAura" | "aura2" | "spellCooldown" | "itemCooldown" | "itemCount" | "weaponEnchant" | "custom" | "other";

/** The trigger kinds each game has. */
export const TRIGGER_KINDS: Record<AddonGameId, readonly TriggerKind[]> = {
  forever: ["secretAura", "aura2", "spellCooldown", "itemCooldown", "itemCount", "weaponEnchant", "custom", "other"],
  tbc: ["aura2", "spellCooldown", "itemCooldown", "itemCount", "weaponEnchant", "custom", "other"],
};

function triggerKind(trigger: LuaValue | undefined, game: AddonGameId): TriggerKind {
  if (!isLuaTable(trigger)) return "other";
  const type = getField(trigger, "type");
  // WeakAuras2 has no Aura (Modern) trigger type: on TBC such a trigger is just an unknown one.
  if (type === "secretAura") return game === "forever" ? "secretAura" : "other";
  if (type === "aura2") return "aura2";
  if (type === "custom") return "custom";
  if (type === "spell" && getField(trigger, "event") === "Cooldown Progress (Spell)") return "spellCooldown";
  if (type === "item") {
    const event = getField(trigger, "event");
    if (event === "Item Count") return "itemCount";
    if (event === "Cooldown Progress (Item)" || event === "Cooldown Progress (Equipment Slot)") return "itemCooldown";
    if (event === "Weapon Enchant") return "weaponEnchant";
  }
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

/**
 * What a trigger reports where the situation says nothing of it: the default moment (present, 45 of 60 seconds left,
 * no stacks). A custom trigger's timer comes from its code, which the simulator doesn't run (GenericTrigger.lua: a
 * trigger state update's states, a status or event trigger's Duration function), so it has none; only an event trigger
 * hidden after a set time (`custom_hide` "timed", without dynamic duration) has its own: its Duration, from when the
 * event fired (GenericTrigger.lua:1904-1909, 540-553).
 */
export function defaultTriggerSituation(info?: Pick<TriggerInfo, "kind" | "trigger">): TriggerSituation {
  if (info?.kind !== "custom") return GENERIC_DEFAULT;
  const g = (k: string) => getField(info.trigger, k);
  const duration = Number(g("duration"));
  const timed = g("custom_type") === "event" && g("custom_hide") === "timed" && g("dynamicDuration") !== true;
  return timed && duration > 0
    ? { present: true, remaining: duration, duration, stacks: 0 }
    : { present: true, remaining: 0, duration: 0, stacks: 0 };
}

/** What `trigger` reports in `facts`: its entry there, else its default (`defaultTriggerSituation`). */
export function triggerSituation(facts: SituationFacts, trigger: TriggerInfo): TriggerSituation {
  return facts.triggers[trigger.index] ?? defaultTriggerSituation(trigger);
}

/**
 * Returns a copy with one trigger's situation changed: from its entry, else from `trigger`'s default (the generic one
 * when only its number is given).
 */
export function withTrigger(situation: Situation, trigger: number | TriggerInfo, patch: Partial<TriggerSituation>): Situation {
  const index = typeof trigger === "number" ? trigger : trigger.index;
  const current = situation.triggers[index] ?? defaultTriggerSituation(typeof trigger === "number" ? undefined : trigger);
  const next = { ...current, ...patch };
  next.duration = Math.max(0, next.duration);
  next.remaining = Math.min(Math.max(0, next.remaining), next.duration > 0 ? next.duration : next.remaining);
  next.stacks = Math.max(0, Math.round(next.stacks));
  return { ...situation, triggers: { ...situation.triggers, [index]: next } };
}

/** The situation `auraId` sees: the workspace-wide one with that aura's own triggers over it (also before combat). */
export function situationForAura(situation: Situation, auraId: unknown): Situation {
  const own = (f: SituationFacts): SituationFacts => {
    const mine = typeof auraId === "string" ? f.auras?.[auraId] : undefined;
    return mine ? { ...f, triggers: { ...f.triggers, ...mine.triggers } } : f;
  };
  const current = own(situation);
  return situation.beforeCombat ? { ...current, beforeCombat: own(situation.beforeCombat) } : current;
}

/** Returns a copy with one trigger of one aura's own situation changed (starting from what that aura sees). */
export function withAuraTrigger(situation: Situation, auraId: string, trigger: number | TriggerInfo, patch: Partial<TriggerSituation>): Situation {
  const index = typeof trigger === "number" ? trigger : trigger.index;
  const sees = withTrigger(situationForAura(situation, auraId), trigger, patch);
  const mine = situation.auras?.[auraId]?.triggers ?? {};
  return { ...situation, auras: { ...situation.auras, [auraId]: { triggers: { ...mine, [index]: sees.triggers[index] } } } };
}

/** Returns a copy without `auraId`'s own situation: it sees the workspace-wide triggers again. */
export function withoutAura(situation: Situation, auraId: string): Situation {
  if (!situation.auras?.[auraId]) return situation;
  const rest = Object.fromEntries(Object.entries(situation.auras).filter(([id]) => id !== auraId));
  const next: Situation = { ...situation, auras: rest };
  if (Object.keys(rest).length === 0) delete next.auras;
  return next;
}

/**
 * Switches combat on or off. In Forever, entering combat records the facts frozen auras keep (`beforeCombat`); on
 * TBC combat is only a world fact (the "In Combat" condition reads it).
 */
export function setInCombat(situation: Situation, inCombat: boolean, game: AddonGameId = "forever"): Situation {
  if (inCombat === situation.inCombat) return situation;
  const { triggers, targetExists, auras } = situation;
  const facts = auras ? { triggers, targetExists, auras } : { triggers, targetExists };
  if (!inCombat || game !== "forever") return { ...facts, inCombat };
  return { ...facts, inCombat: true, beforeCombat: { ...facts, inCombat: false } };
}

/** Forever: the facts frozen state reads: the pre-combat snapshot while in combat, else the current facts. */
export function frozenFacts(situation: Situation): SituationFacts {
  return situation.inCombat ? (situation.beforeCombat ?? { ...situation, inCombat: false }) : situation;
}

/**
 * The default of one trigger's situation, for the docs: the aura is up, 45 of 60 seconds left, no stacks (a custom
 * trigger's differs: `defaultTriggerSituation`).
 */
export const DEFAULT_TRIGGER_SITUATION: Readonly<TriggerSituation> = GENERIC_DEFAULT;

/** A situation an agent sent that isn't one; the message says what's wrong. */
export class SituationError extends Error {
  override name = "SituationError";
}

const TRIGGER_FIELDS = ["present", "remaining", "duration", "stacks"] as const;
const FACT_FIELDS = ["triggers", "targetExists", "inCombat", "auras"] as const;

function readFacts(value: unknown, where: string, base: SituationFacts): SituationFacts {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new SituationError(`${where} must be an object`);
  const v = value as Record<string, unknown>;
  const bool = (key: "targetExists" | "inCombat") => {
    if (v[key] === undefined) return base[key];
    if (typeof v[key] !== "boolean") throw new SituationError(`${where}.${key} must be true or false`);
    return v[key];
  };
  const facts: SituationFacts = {
    triggers: readTriggers(v.triggers, where, {}),
    targetExists: bool("targetExists"),
    inCombat: bool("inCombat"),
  };
  if (v.auras === undefined) return facts;
  if (typeof v.auras !== "object" || v.auras === null || Array.isArray(v.auras)) {
    throw new SituationError(`${where}.auras must be an object keyed by aura id: {"<aura id>": {"triggers": {...}}}`);
  }
  const auras: Record<string, AuraSituation> = {};
  for (const [id, raw] of Object.entries(v.auras)) {
    const at = `${where}.auras.${id}`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new SituationError(`${at} must be an object: {"triggers": {...}}`);
    for (const key of Object.keys(raw)) {
      if (key !== "triggers") throw new SituationError(`${at}.${key} is not part of an aura's situation (only "triggers"; target and combat are the workspace's)`);
    }
    auras[id] = { triggers: readTriggers((raw as Record<string, unknown>).triggers, at, facts.triggers) };
  }
  return { ...facts, auras };
}

/**
 * Reads `{"1": {...}}` trigger situations: each a patch over `base`'s entry for that number (or the default), kept
 * consistent by `withTrigger`.
 */
function readTriggers(value: unknown, where: string, base: Record<number, TriggerSituation>): Record<number, TriggerSituation> {
  const triggers = value ?? {};
  if (typeof triggers !== "object" || triggers === null || Array.isArray(triggers)) {
    throw new SituationError(`${where}.triggers must be an object keyed by trigger number: {"1": {...}}`);
  }
  const read: Record<number, TriggerSituation> = {};
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
    read[index] = withTrigger({ ...DEFAULT_SITUATION, triggers: base }, index, patch).triggers[index];
  }
  return read;
}

/**
 * Reads a situation as agents send it (the push API's situation and `auraSimulator.situation`): JSON
 * `{"targetExists", "inCombat", "triggers": {"1": {"present", "remaining", "duration", "stacks"}}, "auras": {"<aura id>":
 * {"triggers": {...}}}}`. It is a whole situation: what is left out has its default (`DEFAULT_SITUATION`; a trigger's
 * fields `DEFAULT_TRIGGER_SITUATION`; an aura's trigger fields the workspace-wide trigger's).
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
  const triggers = (t: Record<number, TriggerSituation>) => Object.fromEntries(Object.entries(t).map(([k, s]) => [k, { ...s }]));
  const facts = (f: SituationFacts) => ({
    targetExists: f.targetExists,
    inCombat: f.inCombat,
    triggers: triggers(f.triggers),
    ...(f.auras && { auras: Object.fromEntries(Object.entries(f.auras).map(([id, a]) => [id, { triggers: triggers(a.triggers) }])) }),
  });
  return situation.beforeCombat ? { ...facts(situation), beforeCombat: facts(situation.beforeCombat) } : facts(situation);
}
