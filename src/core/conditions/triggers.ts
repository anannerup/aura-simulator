/**
 * Trigger state: what a trigger reports to the region (shown or not, timer, stacks), derived from the aura document
 * and the situation, following WeakAuras' trigger semantics. These are the triggers every game has ("Aura" (aura2),
 * "Cooldown Progress (Spell)" and the rest), with the same rules in Musca Auras and WeakAuras2 (the cited code is
 * the same in both; `src/core/mirrored.ts`). Forever's own triggers (Aura (Modern)) and its combat freezing are in
 * `forever.ts`.
 */
import { finite, getField, type LuaTable } from "../lua-value";
import { triggerSituation, type SituationFacts, type TriggerInfo, type TriggerKind } from "../situation";
import { compare } from "./compare";

export interface TriggerState {
  index: number;
  kind: TriggerKind;
  /** The trigger is active (its state exists for the region and for conditions). */
  active: boolean;
  /** Forever's Aura (Modern) only: the native "missing" button is what is shown (no cooldown swipe). */
  missing: boolean;
  /** Seconds left; undefined when there's no running timer. */
  remaining?: number;
  /** Full duration; 0 when there's no timer. */
  duration: number;
  stacks: number;
  /** Variables generic conditions can read (Conditions.lua:262-470 reads `state[trigger][variable]`). */
  values: Record<string, number | boolean | string | undefined>;
  /** Forever only: in combat this trigger shows its pre-combat state. */
  frozen: boolean;
}

/** Whether the trigger's unit exists. Only the target is modelled; other units always exist. */
export function unitExists(trigger: LuaTable, facts: SituationFacts): boolean {
  return getField(trigger, "unit") === "target" ? facts.targetExists : true;
}

export function timer(present: boolean, remaining: number, duration: number) {
  const running = present && duration > 0 && remaining > 0;
  return { remaining: running ? remaining : undefined, duration: present ? duration : 0 };
}

/** State of one of the triggers every game has (any kind but Aura (Modern), which is Forever's). */
export function triggerState(info: TriggerInfo, facts: SituationFacts): TriggerState {
  switch (info.kind) {
    case "aura2":
      return { ...aura2State(info, facts), frozen: false };
    case "spellCooldown":
      return spellCooldownState(info, facts);
    default:
      return otherState(info, facts);
  }
}

/**
 * Aura (aura2, BuffTrigger2). matchesShowOn: Found (default) / Missing / Always (BuffTrigger2.lua:214-230).
 * Remaining and stack checks only apply when the trigger can match-check (:218-230, :2927, :3252);
 * remOperator/stacksOperator default to >= (:2978, :3253). Missing/Always on a unit that doesn't exist
 * only show with "Show if unit doesn't exist" (unitExists, :3382). Line numbers are Musca Auras v1.15.0's.
 */
export function aura2State(info: TriggerInfo, facts: SituationFacts): Omit<TriggerState, "frozen"> {
  const s = triggerSituation(facts, info.index);
  const g = (k: string) => getField(info.trigger, k);
  const exists = unitExists(info.trigger, facts);
  const present = exists && s.present;
  const showOn = String(g("matchesShowOn") ?? "showOnActive");
  const checks = () => {
    if (g("useRem") === true) {
      const rem = finite(g("rem")) ?? 0;
      if (!(s.duration > 0 && compare(s.remaining, String(g("remOperator") ?? ">="), rem))) return false;
    }
    if (g("useStacks") === true && !compare(s.stacks, String(g("stacksOperator") ?? ">="), finite(g("stacks")) ?? 0)) return false;
    return true;
  };
  let active: boolean;
  if (showOn === "showOnMissing") active = !present && (exists || g("unitExists") === true);
  else if (showOn === "showAlways") active = exists || g("unitExists") === true;
  else active = present && checks();
  const t = timer(present, s.remaining, s.duration);
  return {
    index: info.index,
    kind: info.kind,
    active,
    missing: false,
    ...t,
    stacks: present ? s.stacks : 0,
    values: {
      expirationTime: t.remaining,
      duration: t.duration,
      stacks: present ? s.stacks : undefined,
      buffed: present,
    },
  };
}

/**
 * Cooldown Progress (Spell) (Prototypes.lua:4254). genericShowOn (default showOnCooldown, :4703):
 * showOnCooldown = startTime > 0, showOnReady = startTime == 0, showAlways (:4305-4310). Charges become
 * stacks when the spell has more than one (:4332). Forever's "Desaturate while on cooldown" is in forever.ts.
 */
export function spellCooldownState(info: TriggerInfo, facts: SituationFacts): TriggerState {
  const s = triggerSituation(facts, info.index);
  const onCooldown = s.present && s.remaining > 0;
  const showOn = String(getField(info.trigger, "genericShowOn") ?? "showOnCooldown");
  const active = showOn === "showAlways" ? true : showOn === "showOnReady" ? !onCooldown : onCooldown;
  const t = timer(onCooldown, s.remaining, s.duration);
  return {
    index: info.index,
    kind: info.kind,
    active,
    missing: false,
    ...t,
    stacks: s.stacks,
    values: {
      expirationTime: t.remaining,
      duration: t.duration,
      onCooldown,
      charges: s.stacks,
      stacks: s.stacks > 0 ? s.stacks : undefined,
    },
    frozen: false,
  };
}

/** Any other trigger: active while "present", with the timer and stacks as given. */
export function otherState(info: TriggerInfo, facts: SituationFacts): TriggerState {
  const s = triggerSituation(facts, info.index);
  const t = timer(s.present, s.remaining, s.duration);
  return {
    index: info.index,
    kind: info.kind,
    active: s.present,
    missing: false,
    ...t,
    stacks: s.present ? s.stacks : 0,
    values: { expirationTime: t.remaining, duration: t.duration, stacks: s.present ? s.stacks : undefined },
    frozen: false,
  };
}
