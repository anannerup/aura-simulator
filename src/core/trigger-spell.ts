/**
 * Reading and setting the spell a trigger watches, per WeakAuras trigger system:
 *
 * - `secretAura` (Musca's "Aura (Modern)", BlizzardAuraDisplayTrigger.lua): `auraspellids` (strings),
 *   enabled by `secretUseSpellIDs`; `auraRankSpellIDs` when `secretUseRankSpellIDs` is true.
 * - `aura2` (BuffTrigger2.lua): `auraspellids` (strings) when `useExactSpellId`, names in `auranames` when `useName`.
 * - Generic triggers (GenericTrigger.lua / Prototypes.lua, e.g. type "spell" Cooldown Progress): the `spellName`
 *   argument holds a spell ID (or name), enabled by `use_spellName`, exact ID match by `use_exact_spellName`.
 */
import type { AuraDocument } from "./aura-core";
import { getField, isLuaTable, keyToString, type LuaObject, type LuaValue } from "./lua-value";

function spellId(value: LuaValue | undefined): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function firstId(list: LuaValue | undefined): number | null {
  if (!isLuaTable(list) || !Array.isArray(list)) return null;
  for (const v of list) {
    const id = spellId(v);
    if (id !== null) return id;
  }
  return null;
}

/** The trigger table (`triggers[n].trigger`), or null. `n` is 1-based. */
function getTrigger(aura: AuraDocument, n: number): LuaObject | null {
  const triggers = aura.triggers;
  if (!isLuaTable(triggers)) return null;
  const entry = getField(triggers, n);
  if (!isLuaTable(entry) || Array.isArray(entry)) return null;
  const trigger = entry.trigger;
  return isLuaTable(trigger) && !Array.isArray(trigger) ? trigger : null;
}

/** Number of numbered triggers (`triggers[1..n]`). */
export function triggerCount(aura: AuraDocument): number {
  let n = 0;
  while (getTrigger(aura, n + 1)) n++;
  return n;
}

/** The first spell ID trigger `n` (1-based) watches, or null when it watches none (or only names). */
export function triggerSpellId(aura: AuraDocument, n: number): number | null {
  const trigger = getTrigger(aura, n);
  if (!trigger) return null;
  switch (trigger.type) {
    case "secretAura":
      if (trigger.secretUseRankSpellIDs === true) {
        const rank = firstId(trigger.auraRankSpellIDs);
        if (rank !== null) return rank;
      }
      return trigger.secretUseSpellIDs === false ? null : firstId(trigger.auraspellids);
    case "aura2":
      return trigger.useExactSpellId === true ? firstId(trigger.auraspellids) : null;
    default:
      return trigger.use_spellName === false ? null : spellId(trigger.spellName);
  }
}

/** A spell-ID aura trigger like the built-in sample's, for auras without a trigger. */
function newSecretAuraTrigger(): LuaObject {
  return { type: "secretAura", unit: "player", debuffType: "HELPFUL", nativeFilters: { PLAYER: true } };
}

/**
 * Returns a copy of the aura whose trigger `n` (1-based) watches exactly `id`, using the trigger type's own
 * fields. Creates a `secretAura` trigger when trigger `n` doesn't exist.
 */
export function setTriggerSpellId(aura: AuraDocument, n: number, id: number): AuraDocument {
  if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError(`Invalid spell ID: ${id}`);
  const trigger: LuaObject = { ...(getTrigger(aura, n) ?? newSecretAuraTrigger()) };
  switch (trigger.type) {
    case "secretAura":
      trigger.auraspellids = [String(id)];
      trigger.secretUseSpellIDs = true;
      trigger.useExactSpellId = true;
      trigger.secretUseRankSpellIDs = false;
      break;
    case "aura2":
      trigger.auraspellids = [String(id)];
      trigger.useExactSpellId = true;
      trigger.useName = false;
      break;
    default:
      trigger.spellName = id;
      trigger.use_spellName = true;
      trigger.use_exact_spellName = true;
  }

  const oldTriggers = aura.triggers;
  const triggers: LuaObject = {};
  if (isLuaTable(oldTriggers)) {
    if (Array.isArray(oldTriggers)) oldTriggers.forEach((v, i) => (triggers[keyToString(i + 1)] = v));
    else Object.assign(triggers, oldTriggers);
  }
  const key = keyToString(n);
  const oldEntry = triggers[key];
  const entry: LuaObject = isLuaTable(oldEntry) && !Array.isArray(oldEntry) ? { ...oldEntry } : { untrigger: {} };
  entry.trigger = trigger;
  triggers[key] = entry;
  return { ...aura, triggers };
}
