/** The aura core (spec seam A): everything Lua-related hides behind this interface. */
export { loadAddon } from "./aura-core";
export type { AuraCore, AuraDocument, AuraState, DecodedState, LoadAddonOptions } from "./aura-core";
export { ADDON_REPO, DEFAULT_ADDON_REF, jsDelivrFetcher, jsDelivrUrl } from "./addon-source";
export type { AddonSourceFetcher } from "./addon-source";
export {
  canonicalize,
  entries,
  getField,
  isLuaTable,
  keyFromString,
  keyToString,
} from "./lua-value";
export type { LuaArray, LuaKey, LuaObject, LuaTable, LuaValue } from "./lua-value";
export { sampleIconAura } from "./samples";
export { getTrigger, setTriggerSpellId, triggerCount, triggerSpellId } from "./trigger-spell";
