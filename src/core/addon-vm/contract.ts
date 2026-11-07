/**
 * The addon contract: every entry point and file-local table of the addon that the full addon VM
 * relies on (lua/extract.ts, lua/options.ts, and the game's own part such as lua/extract-forever.ts). Checked right after an addon version loads; anything missing fails
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

/** What every WeakAuras the core loads provides (Musca Auras and official WeakAuras2 alike). */
export const COMMON_CONTRACT: AddonContract = {
  values: [
    fn("WeakAuras.PreAdd"),
    fn("WeakAuras.Add"),
    fn("WeakAuras.Delete"),
    fn("WeakAuras.GetData"),
    fn("WeakAuras.InternalVersion"),
    fn("WeakAuras.IsLoginFinished"),
    fn("WeakAuras.NewAura"),
    fn("WeakAuras.Import"),
    fn("WeakAuras.IsOptionsOpen"),
    fn("Private.LoadOptions"),
    fn("OptionsPrivate.UpdateFrame"),
    { name: "WeakAuras.versionString", kind: "value" },
    table("Private.regionTypes"),
    table("Private.subRegionTypes"),
    table("Private.triggerTypes"),
    table("Private.event_prototypes"),
    table("Private.load_prototype"),
    table("Private.data_stub"),
    table("Private.event_categories"),
    table("Private.regionOptions"),
    fn("Private.GetProperties"),
    fn("Private.GetDataByUID"),
    fn("Private.ValueFromPath"),
    fn("Private.ValueToPath"),
    fn("Private.TraverseLeafsOrAura"),
    fn("Private.AuraWarnings.UpdateWarning"),
    table("OptionsPrivate.registerRegions"),
    fn("OptionsPrivate.commonOptionsCache.Clear"),
    fn("OptionsPrivate.ClearOptions"),
    fn("OptionsPrivate.IsCollapsed"),
  ],
  upvalues: [],
};

/**
 * Musca Auras' own internals (lua/extract-forever.ts, lua/new-aura.ts): Aura (Modern) (BlizzardAuraDisplay and
 * SecretAuraConditions.lua's file-local tables), the combat warnings (TriggerSecretWarnings) and the Packs page.
 */
export const FOREVER_CONTRACT: AddonContract = {
  values: [
    table("Private.AuraSingleShared"),
    table("Private.AuraDisplayShared"),
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
    table("Private.BlizzardAuraDisplay.showOnValues"),
    table("Private.BlizzardAuraDisplay.singleUnits"),
    table("Private.BlizzardAuraDisplay.missingTypes"),
    table("Private.BlizzardAuraDisplay.remOperators"),
    table("Private.BlizzardAuraDisplay.stackOperators"),
    { name: "Private.BlizzardAuraDisplay.STACK_LIMIT", kind: "value" },
    table("Private.BlizzardAuraDisplay.missingRootProperties"),
    table("OptionsPrivate.TriggerSecretWarnings"),
    fn("OptionsPrivate.TriggerSecretWarnings.HasSecretAuraSpell"),
    fn("OptionsPrivate.TriggerSecretWarnings.GetScope"),
    { name: "OptionsPrivate.TriggerSecretWarnings.message", kind: "value" },
    table("OptionsPrivate.utilityPacks"),
    table("OptionsPrivate.classPacks"),
    table("OptionsPrivate.classPackBlockTexts"),
    fn("OptionsPrivate.GetClassPackBlocks"),
    fn("OptionsPrivate.BuildClassPackBlockImport"),
  ],
  upvalues: ["VARIABLES", "ROOT_PROPERTIES", "ELEMENT_PROPERTIES", "HIGHLIGHT_SET"],
};

/** The common contract plus a game's own part. */
export function joinContracts(...parts: AddonContract[]): AddonContract {
  return { values: parts.flatMap((p) => p.values), upvalues: parts.flatMap((p) => p.upvalues) };
}

export class AddonContractError extends Error {
  constructor(
    readonly ref: string,
    readonly missing: string[],
    addonName = "Musca Auras",
  ) {
    super(
      `${addonName} ${ref} no longer provides what the aura core relies on: ${missing.join(", ")}. ` +
        "The aura core needs updating for this addon version.",
    );
    this.name = "AddonContractError";
  }
}
