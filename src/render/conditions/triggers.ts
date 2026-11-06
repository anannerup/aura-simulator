/**
 * Trigger state: what a trigger reports to the region (shown or not, timer, stacks), derived from the
 * aura document and the situation, following the addon's trigger semantics.
 */
import { getField, type LuaTable } from "@/core";
import { triggerSituation, type SituationFacts, type TriggerInfo, type TriggerKind } from "../situation";
import {
  aura2Freezes,
  compare,
  finite,
  inRemainingWindow,
  secretRemainingWindow,
  secretShowOn,
  secretStackFilter,
} from "./forever-rules";

export interface TriggerState {
  index: number;
  kind: TriggerKind;
  /** The trigger is active (its state exists for the region and for conditions). */
  active: boolean;
  /** Aura (Modern) only: the native "missing" button is what is shown (no cooldown swipe). */
  missing: boolean;
  /** Seconds left; undefined when there's no running timer. */
  remaining?: number;
  /** Full duration; 0 when there's no timer. */
  duration: number;
  stacks: number;
  /** Variables generic conditions can read (Conditions.lua:262-470 reads `state[trigger][variable]`). */
  values: Record<string, number | boolean | string | undefined>;
  /** In combat this trigger shows its pre-combat state. */
  frozen: boolean;
}

/** Whether the trigger's unit exists. Only the target is modelled; other units always exist. */
function unitExists(trigger: LuaTable, facts: SituationFacts): boolean {
  return getField(trigger, "unit") === "target" ? facts.targetExists : true;
}

/**
 * State of one trigger. `facts` is the current situation; `frozenFacts` the pre-combat one, which
 * frozen triggers read while in combat.
 */
export function triggerState(info: TriggerInfo, facts: SituationFacts, frozenFacts: SituationFacts, inCombat: boolean): TriggerState {
  const frozen = inCombat && info.kind === "aura2" && aura2Freezes(info.trigger);
  const source = frozen ? frozenFacts : facts;
  switch (info.kind) {
    case "secretAura":
      return secretAuraState(info, source);
    case "aura2":
      return { ...aura2State(info, source), frozen };
    case "spellCooldown":
      return spellCooldownState(info, source);
    default:
      return otherState(info, source);
  }
}

function timer(present: boolean, remaining: number, duration: number) {
  const running = present && duration > 0 && remaining > 0;
  return { remaining: running ? remaining : undefined, duration: present ? duration : 0 };
}

/**
 * Aura (Modern). Show On (SecretAuraSingle.lua:110): Found = while present, Missing = while absent,
 * Always = both. The Remaining Time window (:121-131, :149) and the stack filter
 * (SecretAuraSingleGates.lua:82-112) only count while the aura is present. A missing aura on a unit that
 * doesn't exist isn't drawn (SingleUnitExists, SecretAuraSingle.lua:207).
 */
function secretAuraState(info: TriggerInfo, facts: SituationFacts): TriggerState {
  const s = triggerSituation(facts, info.index);
  const exists = unitExists(info.trigger, facts);
  const present = exists && s.present;
  const showOn = secretShowOn(info.trigger);
  let active: boolean;
  let missing = false;
  if (present) {
    const window = secretRemainingWindow(info.trigger);
    const stackFilter = secretStackFilter(info.trigger);
    const inWindow = !window || (s.duration > 0 && s.remaining > 0 && inRemainingWindow(s.remaining, window.op, window.seconds));
    active = showOn !== "showOnMissing" && inWindow && (!stackFilter || stackFilter(s.stacks));
  } else {
    missing = showOn !== "showOnActive" && exists;
    active = missing;
  }
  const t = timer(present, s.remaining, s.duration);
  return {
    index: info.index,
    kind: info.kind,
    active,
    missing,
    ...t,
    stacks: present ? s.stacks : 0,
    values: {},
    frozen: false,
  };
}

/**
 * Aura (aura2, BuffTrigger2). matchesShowOn: Found (default) / Missing / Always (BuffTrigger2.lua:214-230).
 * Remaining and stack checks only apply when the trigger can match-check (:218-230, :2927, :3252);
 * remOperator/stacksOperator default to >= (:2978, :3253). Missing/Always on a unit that doesn't exist
 * only show with "Show if unit doesn't exist" (unitExists, :3382).
 */
function aura2State(info: TriggerInfo, facts: SituationFacts): Omit<TriggerState, "frozen"> {
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
 * stacks when the spell has more than one (:4332). "Desaturate while on cooldown" is applied in evaluate.ts.
 */
function spellCooldownState(info: TriggerInfo, facts: SituationFacts): TriggerState {
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
function otherState(info: TriggerInfo, facts: SituationFacts): TriggerState {
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
