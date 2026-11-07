/**
 * What every game's evaluator shares: the render state it produces, and plain WeakAuras' trigger and condition
 * rules (the generic part of Conditions.lua, which runs the same in Musca Auras and WeakAuras2; the cited line
 * numbers are Musca Auras v1.15.0's). Each game's evaluator (`forever.ts`, `tbc.ts`) builds on these. Pure; no React.
 */
import type { AuraDocument } from "../aura-core";
import { entries, field, finite, getField, isLuaTable, list, type LuaTable, type LuaValue } from "../lua-value";
import type { SituationFacts } from "../situation";
import { compare } from "./compare";
import { regionDefaults, subRegionDefaults } from "./region-defaults";
import type { DrawnText } from "./text";
import type { TriggerState } from "./triggers";

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
  /** Forever's Aura (Modern): the native "missing" button is drawn (no cooldown swipe, Missing conditions apply). */
  missing: boolean;
  /** Forever: the frozen value padlock is shown (in combat, aura can freeze). Always false on TBC. */
  frozenMarker: boolean;
  triggers: TriggerState[];
  /** The trigger that supplies %p, %s and the cooldown swipe (activeTriggerMode), if any is active. */
  dynamic?: TriggerState;
  /**
   * Effective property values by condition path (`desaturate`, `color`, `alpha`, `zoom`, `sub.2.text_color`,
   * `sub.3.glow`, ...): every plain value and colour of the document and its sub-elements (or the region default
   * where unset), with active condition changes applied. Renderers read these, not the document.
   */
  properties: Record<string, LuaValue>;
  /** 1-based numbers of the generic conditions that are active. */
  activeConditions: number[];
  /** Forever: properties that keep their pre-combat value because the combat restriction blocks the change. */
  heldInCombat: string[];
  /** Forever: stack text from the native display, per sub-region index (Aura (Modern) only). */
  nativeStackText: Record<number, string>;
  /** Glow sub-regions with their computed state. */
  glows: GlowState[];
  /** What each sub text draws, by its 1-based place in `subRegions` (`text.ts`): the game screen and the preview read these. */
  texts: Record<number, DrawnText>;
  /** A text region's own text. */
  displayText?: DrawnText;
}

export function parseSubPath(path: string): { position: number; key: string } | undefined {
  const m = /^sub\.(\d+)\.(.+)$/.exec(path);
  return m ? { position: Number(m[1]), key: m[2] } : undefined;
}

export function subRegion(aura: AuraDocument, position: number): LuaTable | undefined {
  const element = field(aura.subRegions, position);
  return isLuaTable(element) ? element : undefined;
}

/** Conditions.lua:504-522 GetBaseProperty, with the region defaults for unset values. */
export function baseProperty(aura: AuraDocument, path: string): LuaValue | undefined {
  const sub = parseSubPath(path);
  if (sub) {
    const element = subRegion(aura, sub.position);
    if (!element) return undefined;
    const value = getField(element, sub.key);
    return value ?? subRegionDefaults(getField(element, "type"))[sub.key];
  }
  return aura[path] ?? regionDefaults(aura.regionType)[path];
}

export interface CheckContext {
  aura: AuraDocument;
  states: Map<number, TriggerState>;
  facts: SituationFacts;
  /** Checks the generic code never evaluates (Forever: Aura (Modern) native checks, Conditions.lua:229). */
  skip?: (check: LuaValue) => boolean;
}

/** Variables with a known condition type (BuffTrigger2.lua:3688-3800, Prototypes.lua:4690-4740). */
const TIMER_VARIABLES = new Set(["expirationTime"]);

/** Conditions.lua:228-470 CreateTestForCondition, for the condition types the simulator models. */
function evaluateCheck(check: LuaValue | undefined, ctx: CheckContext): boolean {
  if (!isLuaTable(check)) return false;
  if (ctx.skip?.(check)) return false;
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
  if (variable === "show") {
    // "Active" (WeakAuras.lua GetTriggerConditions): a test function, so no `state[trigger]` guard: it compares
    // whether the trigger is active with `needle == 1`, and a value-less check builds no test (Conditions.lua:292).
    if (value === undefined) return false;
    return (state?.active ?? false) === (value === 1);
  }
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
export function genericConditions(aura: AuraDocument, ctx: CheckContext): { active: number[]; values: Map<string, LuaValue> } {
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

/** WeakAuras: `disjunctive` "all" needs every trigger, "any" (default) one; "custom" is treated as "any". */
export function isShown(aura: AuraDocument, states: TriggerState[]): boolean {
  if (states.length === 0) return false;
  return field(aura.triggers, "disjunctive") === "all" ? states.every((s) => s.active) : states.some((s) => s.active);
}

/** activeTriggerMode: -10 = first active trigger; N = trigger N (when active). */
export function dynamicTrigger(aura: AuraDocument, states: TriggerState[]): TriggerState | undefined {
  const mode = finite(field(aura.triggers, "activeTriggerMode")) ?? -10;
  if (mode >= 1) return states.find((s) => s.index === mode && s.active);
  return states.find((s) => s.active);
}

/** A plain value or a colour: what `properties` holds (tables such as triggers or tick lists are left out). */
const isPropertyValue = (v: LuaValue) => !isLuaTable(v) || (Array.isArray(v) && v.every((x) => typeof x === "number"));

/**
 * The properties before conditions: the region defaults, then every plain value and colour of the document, and
 * per sub-element (`sub.N.<key>`) its defaults and values.
 */
export function documentProperties(aura: AuraDocument): Record<string, LuaValue> {
  const properties: Record<string, LuaValue> = {};
  for (const [key, value] of Object.entries(regionDefaults(aura.regionType))) properties[key] = value;
  for (const [key, value] of Object.entries(aura)) if (isPropertyValue(value)) properties[key] = value;
  list(aura.subRegions).forEach((element, i) => {
    if (!isLuaTable(element)) return;
    const prefix = `sub.${i + 1}.`;
    for (const [key, value] of Object.entries(subRegionDefaults(getField(element, "type")))) properties[prefix + key] = value;
    for (const [key, value] of entries(element)) if (typeof key === "string" && isPropertyValue(value)) properties[prefix + key] = value;
  });
  return properties;
}

/** The glow sub-regions, lit by `sub.N.glow` after conditions. */
export function glowStates(aura: AuraDocument, properties: Record<string, LuaValue>): GlowState[] {
  const glows: GlowState[] = [];
  list(aura.subRegions).forEach((element, i) => {
    if (isLuaTable(element) && getField(element, "type") === "subglow") {
      glows.push({ index: i + 1, element, visible: properties[`sub.${i + 1}.glow`] === true });
    }
  });
  return glows;
}
