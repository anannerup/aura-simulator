/** The aura core (spec seam A): everything Lua-related hides behind this interface. */
export { loadAddon } from "./aura-core";
export type { AuraCore, AuraDocument, AuraState, DecodedState, LoadAddonOptions } from "./aura-core";
export { ADDON_REPO, DEFAULT_ADDON_REF, jsDelivrFetcher, jsDelivrUrl } from "./addon-source";
export type { AddonSourceFetcher } from "./addon-source";
export { ADDON_BUNDLE_SETS, bundleFetcher, collectAddonBundle } from "./addon-bundle";
export type { AddonBundle, AddonBundleSet } from "./addon-bundle";
export { canonicalize, field, getField, isLuaTable, list, num } from "./lua-value";
export { DEFAULT_SITUATION, auraTriggers, setInCombat, triggerSituation, withTrigger } from "./situation";
export type { Situation, TriggerKind, TriggerSituation } from "./situation";
export { conditionProblem, evaluateAura } from "./conditions";
export type { AuraRenderState, ConditionProblem, GlowState, TriggerState } from "./conditions";
export { findStateCodes, isStateCode } from "./state-code";
export { plainText } from "./wow-text";
export { LuaLiteralError, parseLuaLiteral, printLuaLiteral } from "./lua-literal";
export { parseCanonicalJson, printCanonicalJson } from "./canonical-json";
export type { LuaKey, LuaObject, LuaTable, LuaValue } from "./lua-value";
export { sampleIconAura } from "./samples";
export { AddonContractError } from "./addon-vm/contract";
export { collectSpellIds } from "./addon-vm/spells";
export type { ClientSpell, SpellInfoSource } from "./addon-vm/spells";
export type { AddonVMReport, Registries } from "./addon-vm/vm";
export { OptionEditError } from "./addon-vm/options";
export type { AuraPacks, NewAuraPage } from "./addon-vm/new-aura";
export type {
  OptionAddress,
  OptionDialog,
  OptionEdit,
  OptionNode,
  OptionsTree,
} from "./addon-vm/options";
export { OPTION_REFERENCE_FORMAT, changedPaths, pathPattern } from "./addon-vm/option-reference";
export type { OptionChoice, OptionReference, OptionReferenceEntry, OptionReferenceOptions, OptionScope, TablePath } from "./addon-vm/option-reference";
export type { CombatStatus, ValidationMessage, ValidationResult } from "./addon-vm/validation";
export { setTriggerSpellId, triggerCount, triggerSpellId } from "./trigger-spell";
