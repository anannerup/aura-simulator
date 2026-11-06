/** Condition evaluator and trigger state: aura document + situation in, what the region shows out. */
export { evaluateAura, evaluateCheck, baseProperty } from "./evaluate";
export type { AuraRenderState, GlowState } from "./evaluate";
export type { TriggerState } from "./triggers";
export { canFreeze, aura2Freezes, validateSecretConditions, textKind } from "./forever-rules";
