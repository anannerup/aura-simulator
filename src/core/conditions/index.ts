/**
 * Trigger and condition evaluation, per game: an aura document and a situation in, what the region shows out.
 *
 * - Forever (`evaluateAura`, `forever.ts`): plain WeakAuras plus Musca Auras' Aura (Modern) and Forever's combat
 *   restriction (freezing, held properties). Whether Aura (Modern) conditions are valid is the core's validation's
 *   call (`conditionProblem`), never decided here.
 * - TBC (`evaluateTbcAura`, `tbc.ts`): plain WeakAuras2, nothing changes in combat.
 *
 * Shared between them only what is the same in both addons (`evaluate.ts`, `triggers.ts`, `region-defaults.ts`);
 * `src/core/mirrored.ts` pins the files each game's rules restate. The page picks a game's rules with `auraRules`.
 */
import type { AuraDocument } from "../aura-core";
import type { AddonGameId } from "../addon-vm/toc";
import { auraTriggers, setInCombat, TRIGGER_KINDS, type Situation, type TriggerInfo, type TriggerKind } from "../situation";
import type { AuraRenderState } from "./evaluate";
import { evaluateAura, type ConditionProblem } from "./forever";
import { evaluateTbcAura } from "./tbc";

export { conditionProblem, evaluateAura } from "./forever";
export type { ConditionProblem } from "./forever";
export { evaluateTbcAura } from "./tbc";
export type { AuraRenderState, GlowState } from "./evaluate";
export type { TriggerState } from "./triggers";

/** One game's situation and evaluation rules: what the preview and the situation controls use for that game. */
export interface AuraRules {
  game: AddonGameId;
  /** The trigger kinds the game has (the situation controls offer one set of controls per kind). */
  triggerKinds: readonly TriggerKind[];
  /**
   * The game restricts addons in combat (Forever): auras can freeze, condition properties can be held, and
   * validation reports a combat verdict (`ValidationResult.combat`). False on TBC: no freezing, no combat check.
   */
  combatRestricted: boolean;
  auraTriggers(aura: AuraDocument): TriggerInfo[];
  setInCombat(situation: Situation, inCombat: boolean): Situation;
  /** `problem`: Forever's Aura (Modern) verdict (`conditionProblem`); TBC ignores it (there is never one). */
  evaluate(aura: AuraDocument, situation: Situation, problem?: ConditionProblem): AuraRenderState;
}

const AURA_RULES: Record<AddonGameId, AuraRules> = {
  forever: {
    game: "forever",
    triggerKinds: TRIGGER_KINDS.forever,
    combatRestricted: true,
    auraTriggers: (aura) => auraTriggers(aura, "forever"),
    setInCombat: (situation, inCombat) => setInCombat(situation, inCombat, "forever"),
    evaluate: evaluateAura,
  },
  tbc: {
    game: "tbc",
    triggerKinds: TRIGGER_KINDS.tbc,
    combatRestricted: false,
    auraTriggers: (aura) => auraTriggers(aura, "tbc"),
    setInCombat: (situation, inCombat) => setInCombat(situation, inCombat, "tbc"),
    evaluate: (aura, situation) => evaluateTbcAura(aura, situation),
  },
};

/** The situation and evaluation rules of `game`. */
export function auraRules(game: AddonGameId): AuraRules {
  return AURA_RULES[game];
}
