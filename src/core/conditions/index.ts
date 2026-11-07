/**
 * Trigger and condition evaluation: an aura document and a situation in, what the region shows out. Restates the
 * addon's trigger, condition and Forever combat rules (pinned in `mirrored.ts`); whether the aura's Aura (Modern)
 * conditions are valid is the core's validation's call (`conditionProblem`), never decided here.
 */
export { conditionProblem, evaluateAura } from "./evaluate";
export type { AuraRenderState, ConditionProblem, GlowState } from "./evaluate";
export type { TriggerState } from "./triggers";
