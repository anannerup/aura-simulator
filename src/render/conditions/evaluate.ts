/**
 * The condition evaluator: from an aura document and a situation to what the region shows, with every
 * condition-driven property resolved. Pure; no React.
 */
import { getField, isLuaTable, type AuraDocument, type LuaTable, type LuaValue } from "@/core";
import { auraTriggers, frozenFacts, type Situation, type SituationFacts } from "../situation";
import {
  containsNativeCondition,
  field,
  finite,
  frozenMarkerShown,
  isGlowProperty,
  isNativeConditionProperty,
  list,
  nativeAllowsProperty,
  nativeVariable,
  NATIVE_VARIABLES,
  PANDEMIC_SHARE,
  parseSubPath,
  secretTrigger,
  subRegion,
  textKind,
  validateSecretConditions,
  HIGHLIGHT_PROPERTIES,
  compare,
} from "./forever-rules";
import { triggerState, type TriggerState } from "./triggers";

export interface GlowState {
  /** 1-based position in `subRegions`. */
  index: number;
  element: LuaTable;
  /** `sub.N.glow` after conditions: whether the glow is lit. */
  visible: boolean;
}

export interface AuraRenderState {
  /** The region is drawn at all. */
  shown: boolean;
  /** Aura (Modern): the native "missing" button is drawn (no cooldown swipe, Missing conditions apply). */
  missing: boolean;
  /** The frozen value padlock is shown (in combat, aura can freeze). */
  frozenMarker: boolean;
  triggers: TriggerState[];
  /** The trigger that supplies %p, %s and the cooldown swipe (activeTriggerMode), if any is active. */
  dynamic?: TriggerState;
  /**
   * Effective property values by condition path (`desaturate`, `color`, `alpha`, `zoom`, `sub.2.text_color`,
   * `sub.3.glow`, ...): the document's value (or the region default) with active condition changes applied.
   */
  properties: Record<string, LuaValue>;
  /** 1-based numbers of the generic conditions that are active. */
  activeConditions: number[];
  /** Properties that keep their pre-combat value because the combat restriction blocks the change. */
  heldInCombat: string[];
  /** Aura (Modern) condition problem; while there is one, generic conditions don't run. */
  problem?: { condition: number; message: string };
  /** Stack text from the native display, per sub-region index (Aura (Modern) only). */
  nativeStackText: Record<number, string>;
  /** Glow sub-regions with their computed state: the hook ticket 08's glow renderer plugs into. */
  glows: GlowState[];
}

/** Region defaults (RegionTypes/Icon.lua:16-40, RegionPrototype AddAlphaToDefault). */
const ICON_DEFAULTS: Record<string, LuaValue> = {
  desaturate: false,
  inverse: false,
  color: [1, 1, 1, 1],
  zoom: 0,
  keepAspectRatio: false,
  cooldown: true,
  cooldownTextDisabled: false,
  cooldownSwipe: true,
  cooldownEdge: false,
  alpha: 1,
};

/** Sub-region defaults (SubRegionTypes/SubText.lua:16-40 for icons; subglow `glow` false). */
const SUB_DEFAULTS: Record<string, Record<string, LuaValue>> = {
  subtext: { text_color: [1, 1, 1, 1], text_visible: true, text_fontSize: 12, text_alpha: 1 },
  subglow: { glow: false },
};

/** Conditions.lua:504-522 GetBaseProperty, with the region defaults for unset values. */
export function baseProperty(aura: AuraDocument, path: string): LuaValue | undefined {
  const sub = parseSubPath(path);
  if (sub) {
    const element = subRegion(aura, sub.position);
    if (!element) return undefined;
    const value = getField(element, sub.key);
    return value ?? SUB_DEFAULTS[String(getField(element, "type"))]?.[sub.key];
  }
  return aura[path] ?? ICON_DEFAULTS[path];
}

interface CheckContext {
  aura: AuraDocument;
  states: Map<number, TriggerState>;
  facts: SituationFacts;
}

/** Variables with a known condition type (BuffTrigger2.lua:3688-3800, Prototypes.lua:4690-4740). */
const TIMER_VARIABLES = new Set(["expirationTime"]);

/** Conditions.lua:228-470 CreateTestForCondition, for the condition types the simulator models. */
export function evaluateCheck(check: LuaValue | undefined, ctx: CheckContext): boolean {
  if (!isLuaTable(check)) return false;
  // Native Aura (Modern) checks are never evaluated by the generic code (Conditions.lua:229).
  if (containsNativeCondition(ctx.aura, check)) return false;
  const variable = getField(check, "variable");
  if (variable === "AND" || variable === "OR") {
    const subs = list(getField(check, "checks"));
    if (subs.length === 0) return false;
    return variable === "AND" ? subs.every((c) => evaluateCheck(c, ctx)) : subs.some((c) => evaluateCheck(c, ctx));
  }
  const trigger = getField(check, "trigger");
  if (typeof trigger !== "number" || typeof variable !== "string") return false;
  const op = String(getField(check, "op") ?? "");
  const value = getField(check, "value");
  if (variable === "alwaystrue") return true; // Conditions.lua:321
  if (trigger === -1) {
    // Global conditions, Conditions.lua:709-750. "Attackable target" counts any target.
    const globals: Record<string, boolean> = {
      incombat: ctx.facts.inCombat,
      hastarget: ctx.facts.targetExists,
      attackabletarget: ctx.facts.targetExists,
    };
    return variable in globals && boolCheck(globals[variable], value);
  }
  const state = ctx.states.get(trigger);
  if (!state || !state.active) return false; // `state[trigger] and ...`
  const current = state.values[variable];
  if (current === undefined) return false; // `state[trigger][variable] ~= nil`
  if (TIMER_VARIABLES.has(variable)) {
    const v = finite(value);
    if (v === undefined || typeof current !== "number") return false;
    // Conditions.lua:330-348: remaining time compared; == within 0.05 s.
    return op === "==" ? Math.abs(current - v) < 0.05 : compare(current, op, v);
  }
  if (typeof current === "boolean") return boolCheck(current, value);
  if (typeof current === "number") {
    const v = finite(value);
    return v !== undefined && compare(current, op, v); // Conditions.lua:323-329
  }
  if (typeof current === "string") return op === "==" ? current === String(value) : op === "~=" ? current !== String(value) : false;
  return false;
}

/** Conditions.lua:413-416: `value == 0` means false, anything else true. */
function boolCheck(current: boolean, value: LuaValue | undefined): boolean {
  if (value === undefined) return false;
  return current === !(value === 0 || value === false);
}

/**
 * Which generic conditions are active and the property values they produce. Conditions.lua:473-493:
 * a `linked` condition is an `elseif` of the one before it (first match in the chain wins).
 * Conditions.lua:524-621: properties of inactive conditions return to the base value, and among active
 * conditions the later one overrides the earlier one.
 */
function genericConditions(aura: AuraDocument, ctx: CheckContext): { active: number[]; values: Map<string, LuaValue> } {
  const active: number[] = [];
  const values = new Map<string, LuaValue>();
  let chainMatched = false;
  list(aura.conditions).forEach((condition, i) => {
    if (!isLuaTable(condition)) return;
    const linked = getField(condition, "linked") === true && i > 0;
    let on: boolean;
    if (linked && chainMatched) on = false;
    else on = evaluateCheck(getField(condition, "check"), ctx);
    chainMatched = linked ? chainMatched || on : on;
    if (!on) return;
    active.push(i + 1);
    for (const change of list(getField(condition, "changes"))) {
      const property = field(change, "property");
      const value = field(change, "value");
      if (typeof property === "string" && value !== undefined) values.set(property, value);
    }
  });
  return { active, values };
}

function triggerStates(aura: AuraDocument, facts: SituationFacts, frozen: SituationFacts, inCombat: boolean) {
  const states = new Map<number, TriggerState>();
  for (const info of auraTriggers(aura)) states.set(info.index, triggerState(info, facts, frozen, inCombat));
  return states;
}

/** WeakAuras: `disjunctive` "all" needs every trigger, "any" (default) one; "custom" is treated as "any". */
function isShown(aura: AuraDocument, states: TriggerState[]): boolean {
  if (states.length === 0) return false;
  return field(aura.triggers, "disjunctive") === "all" ? states.every((s) => s.active) : states.some((s) => s.active);
}

/** activeTriggerMode: -10 = first active trigger; N = trigger N (when active). */
function dynamicTrigger(aura: AuraDocument, states: TriggerState[]): TriggerState | undefined {
  const mode = finite(field(aura.triggers, "activeTriggerMode")) ?? -10;
  if (mode >= 1) return states.find((s) => s.index === mode && s.active);
  return states.find((s) => s.active);
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

export function evaluateAura(aura: AuraDocument, situation: Situation): AuraRenderState {
  const before = frozenFacts(situation);
  const statesMap = triggerStates(aura, situation, before, situation.inCombat);
  const states = [...statesMap.values()];
  const shown = isShown(aura, states);
  const dynamic = dynamicTrigger(aura, states);
  const secret = secretTrigger(aura);
  const secretState = secret ? statesMap.get(secret.index) : undefined;
  const missing = shown && secretState !== undefined && secretState.missing && dynamic === secretState;
  const problem = secret ? validateSecretConditions(aura) : undefined;

  const properties: Record<string, LuaValue> = {};
  const set = (path: string, value: LuaValue) => {
    properties[path] = value;
  };
  for (const key of Object.keys(ICON_DEFAULTS)) set(key, baseProperty(aura, key)!);
  list(aura.subRegions).forEach((element, i) => {
    for (const key of Object.keys(SUB_DEFAULTS[String(field(element, "type"))] ?? {})) {
      const value = baseProperty(aura, `sub.${i + 1}.${key}`);
      if (value !== undefined) set(`sub.${i + 1}.${key}`, value);
    }
  });

  // Generic conditions (Conditions.lua:755-860). Skipped entirely while an Aura (Modern) rule is broken (:760),
  // and only evaluated while the region is shown (`if (not hideRegion)`, :784).
  let activeConditions: number[] = [];
  const heldInCombat: string[] = [];
  if (shown && !problem) {
    const now = genericConditions(aura, { aura, states: statesMap, facts: situation });
    activeConditions = now.active;
    let held: Map<string, LuaValue> | undefined;
    if (secret && situation.inCombat) {
      // Properties of the native display hold their pre-combat value (forever-rules isNativeConditionProperty).
      const beforeStates = triggerStates(aura, before, before, false);
      held = genericConditions(aura, { aura, states: beforeStates, facts: before }).values;
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

  // "Desaturate while on cooldown" (Prototypes.lua:4581, WeakAuras.lua:5381-5390): the game desaturates the
  // icon while the spell is on cooldown, on top of the region's own desaturation.
  for (const info of auraTriggers(aura)) {
    const state = statesMap.get(info.index);
    if (info.kind === "spellCooldown" && state?.active && state.values.onCooldown === true && getField(info.trigger, "use_desaturateOnCooldown") === true) {
      set("desaturate", true);
    }
  }

  const glows: GlowState[] = [];
  list(aura.subRegions).forEach((element, i) => {
    if (isLuaTable(element) && getField(element, "type") === "subglow") {
      glows.push({ index: i + 1, element, visible: properties[`sub.${i + 1}.glow`] === true });
    }
  });

  return {
    shown,
    missing,
    frozenMarker: shown && frozenMarkerShown(aura, situation.inCombat),
    triggers: states,
    dynamic,
    properties,
    activeConditions,
    heldInCombat,
    problem,
    nativeStackText,
    glows,
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
