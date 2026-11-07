import clientData from "./client-data.json";
import { toLuaLiteral, type LuaValue } from "../lua-value";

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
    api: "PowerBarColor (FrameXML)",
    answer: "MANA, RAGE, FOCUS, ENERGY, RUNIC_POWER with the modern client's UI-HUD-UnitFrame-Player-PortraitOff-Bar-* atlases",
    why: "Types.lua registers these atlases as statusbar_atlas media; without any, the Progress Bar's Display tab fails to build.",
    verified: false,
  },
  {
    api: "C_Spell.GetSpellInfo / GetSpellName / GetSpellTexture, GetSpellInfo, GetSpellTexture",
    answer: "name and icon FileDataID from the spell cache's Forever spell list (spells.ts preloads the IDs the aura refers to); nil for any other spell or a name",
    why: 'Spell inputs read "1459 (Arcane Intellect)" instead of "(Unknown Spell)", and validation sees which spells exist. Names resolve only for spells the player knows in the game; the simulated player knows none.',
    verified: false,
  },
  {
    api: "EssentialCooldownViewer, UtilityCooldownViewer, BuffIconCooldownViewer, BuffBarCooldownViewer",
    answer: "present, with no cooldown frames",
    why: "The Cooldown Manager trigger lists the viewers' frames; without them its Trigger tab fails to build. Empty: the simulated player tracks no cooldowns.",
    verified: false,
  },
  {
    api: "GetDifficultyInfo, C_Item.GetItemSubClassInfo, GetNumTalentTabs/GetNumTalents/GetTalentInfo/GetTalentTabInfo",
    answer: "Forever's DB2 data (client-data.json, generated by scripts/client-data.ts from wago.tools): difficulties, weapon and armour types, each class's talents (tabs by OrderIndex, talents by tier then column)",
    why: "The Load tab's Instance Type, Item Type Equipped and Talent lists come from these; stubs left them empty. Talents are listed for every class (the game lists only your own), so a load condition can be built for any class. The talent order must match the game's GetTalentInfo index.",
    verified: false,
  },
  {
    api: "C_SpecializationInfo.GetSpecialization / GetNumSpecializationsForClassID / GetTalentInfo, GetSpecializationInfoForClassID, C_Traits, C_ClassTalents",
    answer: "absent",
    why: "Forever has classic talents and no specializations (Musca's Specialization load option covers its specs). Present, they make the addon take the retail paths: Class and Specialization appears and the Talent lists come out empty.",
    verified: false,
  },
  {
    api: "InCombatLockdown()",
    answer: "false (also during the combat checks)",
    why: "WeakAuras.Add defers work in combat lockdown; the combat checks only need the C_Secrets answers.",
    verified: true,
  },
];

/** The client data in Lua (`__clientData`), for PROFILE_LUA. Loaded before it. */
export const CLIENT_DATA_LUA = `__clientData = ${toLuaLiteral(clientData as unknown as LuaValue)}`;

/** The profile in Lua. Loaded after the shim and CLIENT_DATA_LUA, before the addon's files. */
export const PROFILE_LUA = String.raw`
__profile = { combat = false }
local PR = __profile
local S = __shim
local D = __clientData

-- Instance difficulties (DB2 Difficulty): Types.lua builds the Load tab's Instance Type list from them.
local groupTypes = { [0] = "none", [1] = "party", [2] = "raid", [3] = "pvp", [4] = "arena", [5] = "scenario" }
local difficulties = {}
for _, d in ipairs(D.difficulties) do difficulties[d.id] = d end
function GetDifficultyInfo(id)
  local d = difficulties[id]
  if not d then return nil end
  return d.name, groupTypes[d.instanceType] or "none", false, false, false, false, nil
end

-- Item sub classes (DB2 ItemSubClass): weapon and armour types for Item Type Equipped.
local subClasses = {}
for _, c in ipairs(D.itemSubClasses) do subClasses[c.classId * 256 + c.subClassId] = c.name end
C_Item = C_Item or {}
C_Item.GetItemSubClassInfo = function(classID, subClassID) return subClasses[(classID or 0) * 256 + (subClassID or 0)] end
GetItemSubClassInfo = C_Item.GetItemSubClassInfo

-- No class specializations or trait talent trees (classic talents; Musca's own Specialization load option covers
-- Forever's specs): the auto-stub would otherwise make Compatibility.lua take the retail talent paths.
local noSpecs = { GetSpecialization = true, GetNumSpecializationsForClassID = true, GetActiveSpecGroup = true,
  GetCombatConfigIDForSpecGroup = true, GetTalentInfo = true, GetSpecializationInfo = true }
C_SpecializationInfo = setmetatable({}, { __index = function(t, k)
  if noSpecs[k] then return nil end
  local stub = S.makeStub("C_SpecializationInfo." .. tostring(k))
  rawset(t, k, stub)
  return stub
end })
GetSpecializationInfoForClassID = nil
C_Traits = nil
C_ClassTalents = nil

-- Talents (DB2 Talent, TalentTab) of the simulated player's class, as GetTalentInfo(tab, index) lists them.
MAX_NUM_TALENTS = 20 -- FrameXML (Classic): talents per tab in talent IDs
local function playerTalents()
  local _, class = UnitClass("player")
  return D.talents[class] or {}, D.talentTabs[class] or {}
end
function GetNumTalentTabs() local _, tabs = playerTalents() return #tabs end
function GetNumTalents(tab)
  local n = 0
  for _, t in ipairs((playerTalents())) do if t.tab == tab then n = n + 1 end end
  return n
end
function GetTalentInfo(tab, index)
  for _, t in ipairs((playerTalents())) do
    if t.tab == tab and t.index == index then return t.name, t.icon, t.tier, t.column, 0, t.maxRank end
  end
end
function GetTalentTabInfo(tab)
  local _, tabs = playerTalents()
  local t = tabs[tab]
  if t then return tab, t.name, "", t.icon, 0 end
end

-- After login: every class's talents for the Load tab's Talent option (the game lists only the player's own
-- class; the simulator offers every class, so a load condition can be built for any class).
function PR.afterLoad()
  local P = S.private.WeakAuras
  if not (P and P.talent_types_specific) then return end
  local maxTalents = 20
  for class, list in pairs(D.talents) do
    local t = P.talent_types_specific[class] or {}
    for _, talent in ipairs(list) do
      t[(talent.tab - 1) * maxTalents + talent.index] = "|T" .. talent.icon .. ":0|t " .. talent.name
    end
    P.talent_types_specific[class] = t

  end
end

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
-- FrameXML's power bar colours with the modern client's bar atlases (Types.lua registers them as
-- statusbar_atlas media; the Progress Bar options need that media type to exist).
PowerBarColor = {
  MANA = { r = 0, g = 0, b = 1, atlas = "UI-HUD-UnitFrame-Player-PortraitOff-Bar-Mana" },
  RAGE = { r = 1, g = 0, b = 0, atlas = "UI-HUD-UnitFrame-Player-PortraitOff-Bar-Rage" },
  FOCUS = { r = 1, g = 0.5, b = 0.25, atlas = "UI-HUD-UnitFrame-Player-PortraitOff-Bar-Focus" },
  ENERGY = { r = 1, g = 1, b = 0, atlas = "UI-HUD-UnitFrame-Player-PortraitOff-Bar-Energy" },
  RUNIC_POWER = { r = 0, g = 0.82, b = 1, atlas = "UI-HUD-UnitFrame-Player-PortraitOff-Bar-RunicPower" },
}
-- The Cooldown Manager's viewers, empty (no cooldowns tracked): the CDM trigger lists their frames.
for _, name in ipairs({ "EssentialCooldownViewer", "UtilityCooldownViewer", "BuffIconCooldownViewer", "BuffBarCooldownViewer" }) do
  local viewer = CreateFrame("Frame", name)
  viewer.itemFramePool = { EnumerateActive = function() return function() end end }
  _G[name] = viewer
end

PowerBarColor[0] = PowerBarColor.MANA
PowerBarColor[1] = PowerBarColor.RAGE
PowerBarColor[2] = PowerBarColor.FOCUS
PowerBarColor[3] = PowerBarColor.ENERGY
PowerBarColor[6] = PowerBarColor.RUNIC_POWER

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
