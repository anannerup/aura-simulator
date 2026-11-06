/**
 * The addon contract: every entry point and file-local table of Musca Auras that the full addon VM
 * relies on (lua/extract.ts). Checked right after an addon version loads; anything missing fails
 * the load with an error that names it, instead of producing wrong validation later.
 *
 * Roots: `WeakAuras` (the addon's global), `Private` (the core addon's private table),
 * `OptionsPrivate` (WeakAurasOptions' private table).
 */
export interface AddonContract {
  values: { name: string; kind: "function" | "table" | "value" }[];
  /** File-local tables reached through function upvalues (SecretAuraConditions.lua). */
  upvalues: string[];
}

const fn = (name: string) => ({ name, kind: "function" as const });
const table = (name: string) => ({ name, kind: "table" as const });

export const ADDON_CONTRACT: AddonContract = {
  values: [
    fn("WeakAuras.PreAdd"),
    fn("WeakAuras.Add"),
    fn("WeakAuras.Delete"),
    fn("WeakAuras.GetData"),
    fn("WeakAuras.InternalVersion"),
    fn("WeakAuras.IsLoginFinished"),
    { name: "WeakAuras.versionString", kind: "value" },
    table("Private.regionTypes"),
    table("Private.subRegionTypes"),
    table("Private.triggerTypes"),
    table("Private.event_prototypes"),
    table("Private.load_prototype"),
    table("Private.data_stub"),
    fn("Private.GetProperties"),
    fn("Private.AuraWarnings.UpdateWarning"),
    fn("Private.BlizzardAuraDisplay.Validate"),
    fn("Private.BlizzardAuraDisplay.TriggerStatus"),
    fn("Private.BlizzardAuraDisplay.ValidateConditions"),
    fn("Private.BlizzardAuraDisplay.ValidateAppearance"),
    fn("Private.BlizzardAuraDisplay.PrepareConditionAppearance"),
    fn("Private.BlizzardAuraDisplay.NativeConditionAllowsProperty"),
    fn("Private.BlizzardAuraDisplay.GetTrigger"),
    fn("Private.BlizzardAuraDisplay.GetSavedTrigger"),
    fn("Private.BlizzardAuraDisplay.HasTrigger"),
    fn("Private.BlizzardAuraDisplay.Eligible"),
    fn("Private.BlizzardAuraDisplay.SupportsRegionType"),
    fn("Private.BlizzardAuraDisplay.SupportsDurationColorCondition"),
    table("Private.BlizzardAuraDisplay.units"),
    table("Private.BlizzardAuraDisplay.nativeFilters"),
    table("Private.BlizzardAuraDisplay.booleanFilters"),
    table("OptionsPrivate.TriggerSecretWarnings"),
    fn("OptionsPrivate.TriggerSecretWarnings.HasSecretAuraSpell"),
    fn("OptionsPrivate.TriggerSecretWarnings.GetScope"),
    { name: "OptionsPrivate.TriggerSecretWarnings.message", kind: "value" },
  ],
  upvalues: ["VARIABLES", "ROOT_PROPERTIES", "ELEMENT_PROPERTIES", "HIGHLIGHT_SET"],
};

export class AddonContractError extends Error {
  constructor(
    readonly ref: string,
    readonly missing: string[],
  ) {
    super(
      `Musca Auras ${ref} no longer provides what the aura core relies on: ${missing.join(", ")}. ` +
        "The aura core needs updating for this addon version.",
    );
    this.name = "AddonContractError";
  }
}
