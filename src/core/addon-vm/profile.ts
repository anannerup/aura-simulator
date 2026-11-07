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
 * None of these answers has been checked against the live Forever client yet; ticket 17 (in-game check)
 * should verify each one. (issecretvalue/canaccessvalue and InCombatLockdown in shim.ts are the verified ones.)
 */

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

-- Client capabilities Aura (Modern) asks about: SecrecyLevel for the Get*Secrecy answers below; curves for
-- SupportsDurationColorCondition (Remaining Time filters, seconds-left conditions); duration bindings for duration
-- conditions; StatusBarRenderMode for circular Progress Textures; C_StringUtil/C_DurationUtil for stack-count
-- conditions and native countdown text; C_NamePlate for nameplate triggers. Missing, the addon calls them
-- "not available on this client".
Enum = S.stubFallback({}, "Enum")
Enum.SecrecyLevel = { NeverSecret = 0, AlwaysSecret = 1, ContextuallySecret = 2 }
Enum.LuaCurveType = { Linear = 0, Step = 1 }
Enum.DurationTextBindingProperty = { RemainingDuration = 0, RemainingPercent = 1, ElapsedDuration = 2,
  ElapsedPercent = 3, TotalDuration = 4, StartTime = 5, EndTime = 6 }
Enum.StatusBarRenderMode = S.stubFallback({}, "Enum.StatusBarRenderMode")

-- Aura (Modern) displays are drawn by Blizzard's aura containers ("Cannot load Blizzard_AuraContainer" otherwise).
S.loadedAddons.Blizzard_AuraContainer = true

-- Aura container slots: one fixed aura button per key, initialized during AddAuraSlot. The Remaining Time window
-- (SecretAuraSingleRemaining.lua AcquireSlot) uses the button straight after the call, as ElvUI does, so
-- initialization is taken to be synchronous. AddAuraGroup stays a no-op: groups initialize buttons only when auras
-- show up, and nothing in validation waits for them.
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

-- Secrets: nothing is secret out of combat (a player building auras in town); in combat everything the addon asks
-- about is (conservative, so warnings err on the side of caution), except your own and your pet's identity and casts.
-- Spells are ContextuallySecret: secret when restrictions apply (some may really be NeverSecret).
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

-- Filter strings: HELPFUL or HARMFUL first, then the addon's own Blizzard aura filters (a stub's nil fails every
-- Aura (Modern) with "This client does not support the selected Blizzard aura filters").
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
