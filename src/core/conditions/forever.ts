/**
 * Forever's evaluator (Musca Auras on WoW Forever): plain WeakAuras' trigger and condition rules (`evaluate.ts`,
 * `triggers.ts`) plus what only Musca Auras has: the Aura (Modern) trigger and its native conditions, freezing
 * under the combat restriction (the padlock), condition properties held in combat, and "Desaturate while on
 * cooldown". The restated rules are in `secret-aura-rules.ts`; their files are pinned in `src/core/mirrored.ts`.
 */
import type { AuraDocument } from "../aura-core";
import type { ValidationResult } from "../addon-vm/validation";
import { field, finite, getField, isLuaTable, list, type LuaValue } from "../lua-value";
import { auraTriggers, frozenFacts, triggerSituation, type Situation, type SituationFacts, type TriggerInfo } from "../situation";
import { compare } from "./compare";
import {
  baseProperty,
  documentProperties,
  dynamicTrigger,
  genericConditions,
  glowStates,
  isShown,
  type AuraRenderState,
} from "./evaluate";
import {
  aura2Freezes,
  containsNativeCondition,
  frozenMarkerShown,
  HIGHLIGHT_PROPERTIES,
  inRemainingWindow,
  isGlowProperty,
  isNativeConditionProperty,
  nativeAllowsProperty,
  nativeVariable,
  NATIVE_VARIABLES,
  PANDEMIC_SHARE,
  secretRemainingWindow,
  secretShowOn,
  secretStackFilter,
  secretTrigger,
  textKind,
} from "./secret-aura-rules";
import { aura2State, timer, triggerState, unitExists, type TriggerState } from "./triggers";

/** An Aura (Modern) condition the addon rejects: while there is one, the aura's generic conditions don't run. */
export interface ConditionProblem {
  /** 1-based condition number, when the addon's check could pin it to one. */
  condition?: number;
  message: string;
}

/**
 * The condition problem in the core's validation of an aura (`AuraCore.validate`), if any: what the addon's own
 * ValidateConditions said (Conditions.lua:761). The preview takes it from here, so it and the combat check agree.
 * Forever only (Aura (Modern)); on TBC there is never one.
 */
export function conditionProblem(validation: ValidationResult | undefined): ConditionProblem | undefined {
  const error = validation?.errors.find((e) => e.code === "modern.invalid" && e.pointer?.tab === "conditions");
  if (!error) return undefined;
  return { condition: error.pointer?.tab === "conditions" ? error.pointer.condition : undefined, message: error.message };
}

/**
 * State of one trigger in Forever. `facts` is the current situation; `frozenFacts` the pre-combat one, which
 * frozen "Aura" (aura2) triggers read while in combat (`aura2Freezes`).
 */
function foreverTriggerState(info: TriggerInfo, facts: SituationFacts, frozenFacts: SituationFacts, inCombat: boolean): TriggerState {
  if (info.kind === "secretAura") return secretAuraState(info, facts);
  if (info.kind === "aura2") {
    const frozen = inCombat && aura2Freezes(info.trigger);
    return { ...aura2State(info, frozen ? frozenFacts : facts), frozen };
  }
  return triggerState(info, facts);
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

function triggerStates(aura: AuraDocument, facts: SituationFacts, frozen: SituationFacts, inCombat: boolean) {
  const states = new Map<number, TriggerState>();
  for (const info of auraTriggers(aura, "forever")) states.set(info.index, foreverTriggerState(info, facts, frozen, inCombat));
  return states;
}

/** The value an Aura (Modern) duration variable reads at this moment (SecretAuraConditions.lua:489-497). */
function durationPoint(variable: string, state: TriggerState): number | undefined {
  const r = state.remaining;
  const d = state.duration;
  if (r === undefined || d <= 0) return undefined;
  switch (variable) {
    case "faAuraRemaining":
      return r;
    case "faAuraRemainingPercent":
      return r / d;
    case "faAuraElapsed":
      return d - r;
    case "faAuraElapsedPercent":
      return (d - r) / d;
    case "faAuraTotal":
      return d;
    default:
      return undefined; // Start/End time: not modelled
  }
}

/**
 * What the aura shows in the situation, by Forever's rules. `problem` is the core's verdict on its Aura (Modern)
 * conditions (`conditionProblem`); while there is one, the generic conditions don't run.
 */
export function evaluateAura(aura: AuraDocument, situation: Situation, problem?: ConditionProblem): AuraRenderState {
  const before = frozenFacts(situation);
  const statesMap = triggerStates(aura, situation, before, situation.inCombat);
  const states = [...statesMap.values()];
  const shown = isShown(aura, states);
  const dynamic = dynamicTrigger(aura, states);
  const secret = secretTrigger(aura);
  const secretState = secret ? statesMap.get(secret.index) : undefined;
  const missing = shown && secretState !== undefined && secretState.missing && dynamic === secretState;

  const properties = documentProperties(aura);
  const set = (path: string, value: LuaValue) => {
    properties[path] = value;
  };
  const skip = (check: LuaValue) => containsNativeCondition(aura, check);

  // Generic conditions (Conditions.lua:755-860). Skipped entirely while an Aura (Modern) rule is broken (:760),
  // and only evaluated while the region is shown (`if (not hideRegion)`, :784).
  let activeConditions: number[] = [];
  const heldInCombat: string[] = [];
  if (shown && !problem) {
    const now = genericConditions(aura, { aura, states: statesMap, facts: situation, skip });
    activeConditions = now.active;
    let held: Map<string, LuaValue> | undefined;
    if (secret && situation.inCombat) {
      // Properties of the native display hold their pre-combat value (isNativeConditionProperty).
      const beforeStates = triggerStates(aura, before, before, false);
      held = genericConditions(aura, { aura, states: beforeStates, facts: before, skip }).values;
    }
    const paths = new Set([...now.values.keys(), ...(held?.keys() ?? [])]);
    for (const path of paths) {
      if (held && isNativeConditionProperty(aura, path)) {
        heldInCombat.push(path);
        const value = held.get(path) ?? baseProperty(aura, path);
        if (value !== undefined) set(path, value);
      } else if (now.values.has(path)) set(path, now.values.get(path)!);
    }
  }

  const nativeStackText: Record<number, string> = {};
  if (secret && shown) applyNativeRules(aura, missing ? undefined : secretState, missing, set, nativeStackText);

  // "Desaturate while on cooldown" (Prototypes.lua:4581, WeakAuras.lua:5381-5390), a Musca Auras option: the game
  // desaturates the icon while the spell is on cooldown, on top of the region's own desaturation.
  for (const info of auraTriggers(aura, "forever")) {
    const state = statesMap.get(info.index);
    if (info.kind === "spellCooldown" && state?.active && state.values.onCooldown === true && getField(info.trigger, "use_desaturateOnCooldown") === true) {
      set("desaturate", true);
    }
  }

  return {
    shown,
    missing,
    frozenMarker: shown && frozenMarkerShown(aura, situation.inCombat),
    triggers: states,
    dynamic,
    properties,
    activeConditions,
    heldInCombat,
    nativeStackText,
    glows: glowStates(aura, properties),
  };
}

/**
 * Aura (Modern) conditions are evaluated by the native display, not by the generic code, and keep
 * working in combat because they are bound to the game's own duration/stack/glow drivers:
 * - Missing conditions on the missing button (SecretAuraConditions.lua:1132-1144 ApplyMissingConditions).
 * - Duration text colour/visibility curves (:657-722 CollectRules/ApplyRules/DurationColorCondition).
 * - Stack text rules (:735-760 StackTextFor).
 * - Glow from seconds left/elapsed `<` (SecretAuraSingleGates.lua:165-188 LateGlowSpec) and pandemic (:510-516).
 * Each rule only drives the properties its variable allows (:489-559); highlights are not drawn.
 */
function applyNativeRules(
  aura: AuraDocument,
  state: TriggerState | undefined,
  missing: boolean,
  set: (path: string, value: LuaValue) => void,
  stackText: Record<number, string>,
) {
  const conditions = list(aura.conditions).filter(isLuaTable);

  if (missing) {
    for (const condition of conditions) {
      const check = getField(condition, "check");
      if (nativeVariable(aura, check) !== "faAuraMissing") continue;
      for (const change of list(getField(condition, "changes"))) {
        const property = field(change, "property");
        const value = field(change, "value");
        if (typeof property === "string" && value !== undefined && !HIGHLIGHT_PROPERTIES.has(property) && nativeAllowsProperty(aura, check, property)) {
          set(property, value);
        }
      }
    }
  }

  // Text rules by sub-region (CollectRules :657: non-linked, numeric threshold >= 0, allowed operator).
  list(aura.subRegions).forEach((element, i) => {
    if (!isLuaTable(element) || getField(element, "type") !== "subtext") return;
    const position = i + 1;
    const kind = textKind(getField(element, "text_text"));
    if (kind !== "duration" && kind !== "stack") return;
    const family = kind;
    const colorPath = `sub.${position}.text_color`;
    const visiblePath = `sub.${position}.text_visible`;
    const textPath = `sub.${position}.text_text`;
    const rules: { threshold: number; op: string; variable: string; channel: string; value: LuaValue }[] = [];
    for (const condition of conditions) {
      if (getField(condition, "linked") === true) continue;
      const check = getField(condition, "check");
      const name = nativeVariable(aura, check);
      const variable = name ? NATIVE_VARIABLES[name] : undefined;
      const threshold = finite(field(check, "value"));
      const op = String(field(check, "op") ?? "");
      if (!variable || variable.family !== family || threshold === undefined || threshold < 0 || !variable.operators?.includes(op)) continue;
      for (const change of list(getField(condition, "changes"))) {
        const property = field(change, "property");
        const value = field(change, "value");
        const channel = property === colorPath ? "color" : property === visiblePath ? "visible" : property === textPath ? "text" : undefined;
        if (!channel || value === undefined || (family === "duration" && channel === "text")) continue;
        rules.push({ threshold: threshold / variable.divisor, op, variable: name!, channel, value });
      }
    }
    const baseVisible = getField(element, "text_visible") !== false;
    if (family === "duration") {
      if (!state || rules.length === 0) return;
      let color: LuaValue | undefined;
      let visible = baseVisible;
      for (const rule of rules) {
        const point = durationPoint(rule.variable, state);
        if (point === undefined || !compare(point, rule.op, rule.threshold)) continue;
        if (rule.channel === "color") color = rule.value;
        else if (rule.channel === "visible") visible = rule.value !== false;
      }
      if (color !== undefined) set(colorPath, color);
      set(visiblePath, visible);
    } else {
      // StackTextFor (:735): without rules the count shows from 2 stacks on; with rules, the format of the
      // highest step point not above the count applies (:725-733 StackPoints/StackFormat).
      const count = state?.stacks ?? 0;
      if (rules.length === 0) {
        stackText[position] = count >= 2 ? String(count) : "";
        return;
      }
      const points = new Set([0, 2]);
      for (const r of rules) {
        points.add(Math.floor(r.threshold));
        points.add(Math.ceil(r.threshold));
        points.add(Math.floor(r.threshold) + 1);
      }
      let text = "";
      for (const point of [...points].sort((a, b) => a - b)) {
        if (point > count) continue;
        let visible = point >= 2 && baseVisible;
        let pattern: string | undefined;
        let color: LuaValue | undefined;
        for (const r of rules) {
          if (!compare(point, r.op, r.threshold)) continue;
          if (r.channel === "color") color = r.value;
          else if (r.channel === "visible") visible = r.value !== false;
          else if (r.channel === "text" && typeof r.value === "string") {
            pattern = r.value;
            visible = true;
          }
        }
        text = visible ? (pattern ?? "%d") : "";
        if (color !== undefined) set(colorPath, color);
        else set(colorPath, baseProperty(aura, colorPath) ?? [1, 1, 1, 1]);
      }
      stackText[position] = text.replace(/%([%d])/g, (_, s: string) => (s === "d" ? String(count) : "%"));
    }
  });

  // Glows lit by a time rule (LateGlowSpec: the first `<` rule on seconds left/elapsed with value > 0 and a
  // glow change) or by the pandemic window.
  if (state && aura.regionType === "icon") {
    let lateDone = false;
    for (const condition of conditions) {
      const check = getField(condition, "check");
      const name = nativeVariable(aura, check);
      if (!name || field(check, "checks") !== undefined || getField(condition, "linked") === true) continue;
      const glowChange = list(getField(condition, "changes")).find((c) => {
        const p = field(c, "property");
        return typeof p === "string" && field(c, "value") === true && isGlowProperty(aura, p);
      });
      if (!glowChange) continue;
      const path = String(field(glowChange, "property"));
      if ((name === "faAuraRemaining" || name === "faAuraElapsed") && !lateDone && field(check, "op") === "<") {
        const limit = finite(field(check, "value"));
        if (limit === undefined || limit <= 0) continue;
        lateDone = true;
        const point = durationPoint(name, state);
        if (point !== undefined && point < limit) set(path, true);
      } else if (name === "faAuraPandemic") {
        if (state.remaining !== undefined && state.remaining <= state.duration * PANDEMIC_SHARE) set(path, true);
      }
    }
  }
}
