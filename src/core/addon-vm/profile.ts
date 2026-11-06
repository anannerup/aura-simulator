/**
 * The Forever client profile: every answer from the (simulated) game client that changes what the
 * addon's own validation says. The WoW API shim answers everything else with permissive stubs, which
 * silently pick code paths ("does C_X.Y exist?" -> yes, "C_X.Y()" -> nil). For the APIs below that
 * would decide validation, so they are answered explicitly here instead, in one place.
 *
 * The VM runs in two states:
 * - out of combat (login, PreAdd, WeakAuras.Add): C_Secrets says nothing is secret, as for a
 *   player building auras in town;
 * - in combat (the combat checks in validate()): C_Secrets answers as during a fight, so the
 *   addon's own "the game hides values of this trigger" logic reports what would stop working.
 *
 * None of these answers has been checked against the live Forever client yet; ticket 17 (in-game
 * check) should verify the entries marked `verified: false`.
 */

export interface ProfileEntry {
  /** The client API or value. */
  api: string;
  /** What the profile answers. */
  answer: string;
  /** Why, and what it changes in validation. */
  why: string;
  /** Checked in the game? */
  verified: boolean;
}

export const FOREVER_CLIENT_PROFILE: readonly ProfileEntry[] = [
  {
    api: "GetBuildInfo / WOW_PROJECT_ID",
    answer: '"1.60.1", build 16001; WOW_PROJECT_ID = WOW_PROJECT_CLASSIC (2)',
    why: "The addon reads the project ID in a few places only; Forever is a classic-era realm on the modern client.",
    verified: false,
  },
  {
    api: "C_Secrets.HasSecretRestrictions()",
    answer: "false out of combat, true in combat",
    why: "TriggerSecretWarnings skips every combat warning when it is false; the combat check asks the in-combat question.",
    verified: false,
  },
  {
    api: "C_Secrets.Should*BeSecret(...) (auras, cooldowns, spell auras/cooldowns, unit stats, health max, power, threat, aura instances)",
    answer: "false out of combat, true in combat",
    why: "Conservative: in combat everything the addon asks about is treated as hidden, so warnings err on the side of caution.",
    verified: false,
  },
  {
    api: "C_Secrets.ShouldUnitIdentityBeSecret(unit), ShouldUnitSpellCastingBeSecret(unit)",
    answer: "false for player and pet; for other units the combat flag",
    why: "Your own name and casts stay readable; other units' identity and casts are treated as hidden in combat.",
    verified: false,
  },
  {
    api: "C_Secrets.Get*Secrecy(...) (spell aura, spell cooldown, spell cast, power type)",
    answer: "Enum.SecrecyLevel.ContextuallySecret",
    why: "Static level: secret when restrictions apply. Makes classic Aura triggers with exact spell IDs warn, as the spec's combat model says. Some spells may really be NeverSecret (whitelisted).",
    verified: false,
  },
  {
    api: "Enum.SecrecyLevel",
    answer: "{ NeverSecret = 0, AlwaysSecret = 1, ContextuallySecret = 2 }",
    why: "Needed for the Get*Secrecy answers; numeric values are tokens only.",
    verified: false,
  },
  {
    api: "issecretvalue(v) / canaccessvalue(v)",
    answer: "false / true",
    why: "The VM never holds live game values, so no value is secret; checks on live trigger states find nothing.",
    verified: true,
  },
  {
    api: "C_CurveUtil (CreateCurve, CreateColorCurve, EvaluateColorValueFromBoolean), Enum.LuaCurveType",
    answer: "present (inert curve objects); LuaCurveType = { Linear = 0, Step = 1 }",
    why: "AuraDisplay.SupportsDurationColorCondition() needs them; without it Remaining Time filters and seconds-left conditions are 'not available on this client'.",
    verified: false,
  },
  {
    api: "Enum.DurationTextBindingProperty",
    answer: "RemainingDuration, RemainingPercent, ElapsedDuration, ElapsedPercent, TotalDuration, StartTime, EndTime",
    why: "An Aura (Modern) duration condition is only offered when its binding exists on the client.",
    verified: false,
  },
  {
    api: "C_StringUtil.CreateNumericRuleFormatter, C_DurationUtil",
    answer: "present (inert objects)",
    why: "Stack-count conditions and native countdown text are only offered when these exist.",
    verified: false,
  },
  {
    api: "Enum.StatusBarRenderMode",
    answer: "present",
    why: "Without it a circular Progress Texture on an Aura (Modern) trigger fails validation ('cannot draw circular Progress Textures').",
    verified: false,
  },
  {
    api: "AuraUtil.IsValidFilterString(filter)",
    answer: "true for HELPFUL or HARMFUL followed by the addon's own Blizzard aura filters (optionally negated with !) and INCLUDE_NAME_PLATE_ONLY",
    why: "A stub answers nil, which fails every Aura (Modern) with 'This client does not support the selected Blizzard aura filters'. The profile trusts the addon's filter list.",
    verified: false,
  },
  {
    api: "C_NamePlate.GetNamePlateForUnit",
    answer: "present",
    why: "Aura (Modern) triggers on nameplates fail validation without it.",
    verified: false,
  },
  {
    api: 'C_AddOns.IsAddOnLoaded("Blizzard_AuraContainer")',
    answer: "true",
    why: "Aura (Modern) displays are drawn by Blizzard's aura containers; without it every Aura (Modern) warns 'Cannot load Blizzard_AuraContainer'.",
    verified: false,
  },
  {
    api: 'CreateFrame("AuraContainer", ...):AddAuraSlot(key, filter, options)',
    answer:
      "creates the slot's aura button (a mock Button parented to the container) and calls options.initializeFrame(button) before returning",
    why:
      "The Remaining Time window on an Icon (secretUseRem) takes its button from initializeFrame right after AddAuraSlot " +
      "(SecretAuraSingleRemaining.lua AcquireSlot). The generic frame stub never called it, so every such aura warned " +
      "'Blizzard could not create the Remaining Time display: no slot'. Synchronous initialization is inferred from the " +
      "addon (and ElvUI's aura containers), which use the button straight after the call. AddAuraGroup stays a no-op: " +
      "groups initialize buttons only when auras show up, and nothing in validation waits for them.",
    verified: false,
  },
  {
    api: "C_Spell.GetSpellInfo / GetSpellName / GetSpellTexture, GetSpellInfo, GetSpellTexture",
    answer: "name and icon FileDataID from the spell cache's Forever spell list (spells.ts preloads the IDs the aura refers to); nil for any other spell or a name",
    why: 'Spell inputs read "1459 (Arcane Intellect)" instead of "(Unknown Spell)", and validation sees which spells exist. Names resolve only for spells the player knows in the game; the simulated player knows none.',
    verified: false,
  },
  {
    api: "InCombatLockdown()",
    answer: "false (also during the combat checks)",
    why: "WeakAuras.Add defers work in combat lockdown; the combat checks only need the C_Secrets answers.",
    verified: true,
  },
];

/** The profile in Lua. Loaded after the shim, before the addon's files. */
export const PROFILE_LUA = String.raw`
__profile = { combat = false }
local PR = __profile
local S = __shim

Enum = S.stubFallback({}, "Enum")
Enum.SecrecyLevel = { NeverSecret = 0, AlwaysSecret = 1, ContextuallySecret = 2 }
Enum.LuaCurveType = { Linear = 0, Step = 1 }
Enum.DurationTextBindingProperty = { RemainingDuration = 0, RemainingPercent = 1, ElapsedDuration = 2,
  ElapsedPercent = 3, TotalDuration = 4, StartTime = 5, EndTime = 6 }
Enum.StatusBarRenderMode = S.stubFallback({}, "Enum.StatusBarRenderMode")

S.loadedAddons.Blizzard_AuraContainer = true

-- Aura container slots: one fixed aura button per key, initialized during AddAuraSlot.
S.kindMethods.AuraContainer = {
  AddAuraSlot = function(self, key, _filter, options)
    local slots = rawget(self, "__auraSlots") or {}
    rawset(self, "__auraSlots", slots)
    local button = S.newFrame("Button", nil, self)
    slots[key] = button
    if type(options) == "table" and type(options.initializeFrame) == "function" then options.initializeFrame(button) end
  end,
}

local function inCombat() return PR.combat end
local function contextual() return Enum.SecrecyLevel.ContextuallySecret end
local function otherUnitInCombat(unit)
  if unit == "player" or unit == "pet" then return false end
  return PR.combat
end
C_Secrets = S.stubFallback({
  HasSecretRestrictions = inCombat,
  ShouldAurasBeSecret = inCombat,
  ShouldCooldownsBeSecret = inCombat,
  ShouldSpellCooldownBeSecret = inCombat,
  ShouldSpellAuraBeSecret = inCombat,
  ShouldUnitStatsBeSecret = inCombat,
  ShouldUnitAuraInstanceBeSecret = inCombat,
  ShouldUnitHealthMaxBeSecret = inCombat,
  ShouldUnitPowerBeSecret = inCombat,
  ShouldUnitPowerMaxBeSecret = inCombat,
  ShouldUnitThreatStateBeSecret = inCombat,
  ShouldUnitThreatValuesBeSecret = inCombat,
  ShouldUnitIdentityBeSecret = otherUnitInCombat,
  ShouldUnitSpellCastingBeSecret = otherUnitInCombat,
  GetSpellAuraSecrecy = contextual,
  GetSpellCooldownSecrecy = contextual,
  GetSpellCastSecrecy = contextual,
  GetPowerTypeSecrecy = contextual,
}, "C_Secrets")

-- Inert client objects (curves, formatters, durations): any method call is accepted and logged.
local function inert(name) return function() return S.makeStub(name) end end
C_CurveUtil = S.stubFallback({
  CreateCurve = inert("C_CurveUtil.CreateCurve()"),
  CreateColorCurve = inert("C_CurveUtil.CreateColorCurve()"),
  EvaluateColorValueFromBoolean = function(value, ifTrue, ifFalse)
    if value then return ifTrue end
    return ifFalse
  end,
}, "C_CurveUtil")
C_StringUtil = S.stubFallback({
  CreateNumericRuleFormatter = inert("C_StringUtil.CreateNumericRuleFormatter()"),
}, "C_StringUtil")
C_DurationUtil = S.stubFallback({
  CreateDuration = inert("C_DurationUtil.CreateDuration()"),
  CreateDurationTextBinding = inert("C_DurationUtil.CreateDurationTextBinding()"),
}, "C_DurationUtil")
C_NamePlate = S.stubFallback({
  GetNamePlateForUnit = function() return nil end,
  GetNamePlates = function() return {} end,
}, "C_NamePlate")

-- Filter strings: HELPFUL or HARMFUL first, then the addon's own Blizzard aura filters.
local function knownFilters()
  local display = S.private.WeakAuras and S.private.WeakAuras.BlizzardAuraDisplay
  local known = { INCLUDE_NAME_PLATE_ONLY = true }
  for _, row in ipairs(display and display.nativeFilters or {}) do known[row[1]] = true end
  return known
end
AuraUtil = S.stubFallback({
  IsValidFilterString = function(filter)
    if type(filter) ~= "string" then return false end
    local known = knownFilters()
    local first = true
    for token in filter:gmatch("[^|]+") do
      if first then
        if token ~= "HELPFUL" and token ~= "HARMFUL" then return false end
        first = false
      elseif not known[(token:gsub("^!", ""))] then
        return false
      end
    end
    return not first
  end,
}, "AuraUtil")
`;
