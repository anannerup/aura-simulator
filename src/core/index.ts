/** The aura core (spec seam A): everything Lua-related hides behind this interface. */
export { loadAddon } from "./aura-core";
export type { AuraCore, AuraDocument, AuraState, DecodedState, LoadAddonOptions } from "./aura-core";
export { ADDON_REPO, DEFAULT_ADDON_REF, jsDelivrFetcher, jsDelivrUrl } from "./addon-source";
export type { AddonSourceFetcher } from "./addon-source";
export { ADDON_BUNDLE_SETS, bundleFetcher, collectAddonBundle } from "./addon-bundle";
export type { AddonBundle, AddonBundleSet } from "./addon-bundle";
export { canonicalize, entries, getField, isLuaTable } from "./lua-value";
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
export type { CombatStatus, ValidationMessage, ValidationResult } from "./addon-vm/validation";
export { setTriggerSpellId, triggerCount, triggerSpellId } from "./trigger-spell";
