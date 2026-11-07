/**
 * TBC Anniversary's evaluator (official WeakAuras2): plain WeakAuras' trigger and condition rules and nothing
 * else. The client has no combat restriction (no secret values, `.scratch/tbc-anniversary/research.md` §5), so
 * nothing freezes or is held in combat, and WeakAuras2 has no Aura (Modern) trigger, native conditions, `faAura*`
 * variables or "Desaturate while on cooldown". Being in combat is only what the "In Combat" condition reads.
 */
import type { AuraDocument } from "../aura-core";
import type { LuaValue } from "../lua-value";
import { auraTriggers, type Situation } from "../situation";
import { documentProperties, dynamicTrigger, genericConditions, glowStates, isShown, type AuraRenderState } from "./evaluate";
import { auraTexts } from "./text";
import { triggerState, type TriggerState } from "./triggers";

/** What the aura shows in the situation, by TBC's (plain WeakAuras2) rules. */
export function evaluateTbcAura(aura: AuraDocument, situation: Situation): AuraRenderState {
  const statesMap = new Map<number, TriggerState>();
  for (const info of auraTriggers(aura, "tbc")) statesMap.set(info.index, triggerState(info, situation));
  const states = [...statesMap.values()];
  const shown = isShown(aura, states);
  const properties: Record<string, LuaValue> = documentProperties(aura);

  // Generic conditions (Conditions.lua), only while the region is shown.
  let activeConditions: number[] = [];
  if (shown) {
    const now = genericConditions(aura, { aura, states: statesMap, facts: situation });
    activeConditions = now.active;
    for (const [path, value] of now.values) properties[path] = value;
  }

  const dynamic = dynamicTrigger(aura, states);
  return {
    shown,
    missing: false,
    frozenMarker: false,
    triggers: states,
    dynamic,
    properties,
    activeConditions,
    heldInCombat: [],
    nativeStackText: {},
    glows: glowStates(aura, properties),
    ...auraTexts(aura, properties, states, dynamic),
  };
}
