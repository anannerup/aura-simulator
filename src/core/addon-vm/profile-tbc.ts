/**
 * The TBC Anniversary client profile: what the (simulated) 2.5.6 client answers where the shim's defaults (written
 * for Forever) or its permissive auto-stubs would be wrong. Loaded after the shim, before WeakAuras2's files.
 *
 * Sources: Blizzard's UI source for the `classic_anniversary` branch (2.5.6.70577: FrameXML constants and the
 * generated API docs) and WeakAuras2 5.22.1 (`.scratch/tbc-anniversary/research.md`). Every answer below is
 * UNVERIFIED in game until the TBC v1 auras are imported on TBC Anniversary (ticket 09); each is marked so.
 *
 * Client data (difficulties, item sub classes, talents) is `client-data-tbc.json`, generated from wago.tools'
 * `wow_anniversary` DB2 exports by `node scripts/client-data.ts`. Spells come from the spell database per call.
 */
import clientData from "./client-data-tbc.json";
import { toLuaLiteral, type LuaValue } from "../lua-value";

/** TBC's client data in Lua (`__clientData`), for TBC_PROFILE_LUA. Loaded before it. */
export const TBC_CLIENT_DATA_LUA = `__clientData = ${toLuaLiteral(clientData as unknown as LuaValue)}`;

export const TBC_PROFILE_LUA = String.raw`
__profile = {}
local S = __shim
local D = __clientData

-- UNVERIFIED: answers from DB2 (client-data-tbc.json) through the classic APIs, as the 2.5.6 client has them.
-- Instance difficulties (DB2 Difficulty): the Load tab's Instance Difficulty / Instance Type lists.
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
-- UNVERIFIED: talents per tab in talent IDs (Blizzard_TalentUI; WeakAuras2 falls back to 20 when it is unset, but the
-- shim would answer an unset ALL_CAPS global with its own name).
MAX_NUM_TALENTS = 20
-- Talents (DB2 Talent, TalentTab) of the simulated player's class, as GetTalentInfo(tab, index) lists them.
-- (WeakAuras2's TBC Talent load option reads its own table, Types_TBC.lua Private.talentInfo, not these.)
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

-- UNVERIFIED: build identity. Version, build and interface from the classic_anniversary UI source head
-- "2.5.6 (70577)" and WeakAuras_TBC.toc ("## Interface: 20506"). The build date is a placeholder (nothing reads it).
function GetBuildInfo() return "2.5.6", "70577", "Oct 21 2026", 20506, "", "", 20506 end
-- UNVERIFIED: Blizzard_FrameXMLBase/TBC/Constants.lua sets WOW_PROJECT_ID = WOW_PROJECT_BURNING_CRUSADE_CLASSIC (5).
-- (WeakAuras2 takes its flavor from the TOC's X-Flavor: TBC, which the loader reads from WeakAuras_TBC.toc.)
WOW_PROJECT_ID = WOW_PROJECT_BURNING_CRUSADE_CLASSIC
-- UNVERIFIED: The Burning Crusade is expansion level 1; the level cap is 70.
LE_EXPANSION_LEVEL_CURRENT = 1
MAX_PLAYER_LEVEL = 70
function UnitLevel() return 70 end
function GetRealmName() return "Anniversary" end
function GetNormalizedRealmName() return "Anniversary" end

-- UNVERIFIED: the TBC races (Blood Elf 10, Draenei 11) in addition to the vanilla ones the shim lists.
do
  local races = { [10] = { "Blood Elf", "BloodElf" }, [11] = { "Draenei", "Draenei" } }
  local vanilla = C_CreatureInfo.GetRaceInfo
  C_CreatureInfo.GetRaceInfo = function(id)
    local r = races[id]
    if r then return { raceName = r[1], clientFileString = r[2], raceID = id } end
    return vanilla(id)
  end
end

-- UNVERIFIED: creature types (Types.lua's Creature Type list). Names and IDs are DB2 CreatureType of build
-- 2.5.6.70577 (wago.tools); whether GetCreatureTypeIDs lists the flagged ones (Critter, Non-combat Pet, Gas Cloud)
-- is not known.
do
  local names = { "Beast", "Dragonkin", "Demon", "Elemental", "Giant", "Undead", "Humanoid", "Critter", "Mechanical",
    "Not specified", "Totem", "Non-combat Pet", "Gas Cloud" }
  C_CreatureInfo.GetCreatureTypeIDs = function()
    local ids = {}
    for id in ipairs(names) do ids[id] = id end
    return ids
  end
  C_CreatureInfo.GetCreatureTypeInfo = function(id)
    if names[id] then return { creatureTypeID = id, name = names[id] } end
  end
end

-- UNVERIFIED: FrameXML's power bar colours, copied from classic_anniversary Blizzard_UnitFrame/Classic/UnitFrame.lua
-- (assumed to be the file the TBC client loads). Types.lua registers the ones with an atlas as statusbar_atlas
-- media, which the Progress Bar options list.
PowerBarColor = {}
PowerBarColor["MANA"] = { r = 0.00, g = 0.00, b = 1.00 }
PowerBarColor["RAGE"] = { r = 1.00, g = 0.00, b = 0.00, fullPowerAnim = true }
PowerBarColor["FOCUS"] = { r = 1.00, g = 0.50, b = 0.25, fullPowerAnim = true }
PowerBarColor["ENERGY"] = { r = 1.00, g = 1.00, b = 0.00, fullPowerAnim = true }
PowerBarColor["HAPPINESS"] = { r = 1.00, g = 0.41, b = 0.96 }
PowerBarColor["RUNIC_POWER"] = { r = 0.00, g = 0.82, b = 1.00 }
PowerBarColor["SOUL_SHARDS"] = { r = 0.50, g = 0.32, b = 0.55 }
PowerBarColor["LUNAR_POWER"] = { r = 0.30, g = 0.52, b = 0.90, atlas = "_Druid-LunarBar" }
PowerBarColor["HOLY_POWER"] = { r = 0.95, g = 0.90, b = 0.60 }
PowerBarColor["MAELSTROM"] = { r = 0.00, g = 0.50, b = 1.00, atlas = "_Shaman-MaelstromBar", fullPowerAnim = true }
PowerBarColor["INSANITY"] = { r = 0.40, g = 0, b = 0.80, atlas = "_Priest-InsanityBar" }
PowerBarColor["COMBO_POINTS"] = { r = 1.00, g = 0.96, b = 0.41 }
PowerBarColor["CHI"] = { r = 0.71, g = 1.0, b = 0.92 }
PowerBarColor["ARCANE_CHARGES"] = { r = 0.1, g = 0.1, b = 0.98 }
PowerBarColor["FURY"] = { r = 0.788, g = 0.259, b = 0.992, atlas = "_DemonHunter-DemonicFuryBar", fullPowerAnim = true }
PowerBarColor["PAIN"] = { r = 255 / 255, g = 156 / 255, b = 0, atlas = "_DemonHunter-DemonicPainBar", fullPowerAnim = true }
PowerBarColor["AMMOSLOT"] = { r = 0.80, g = 0.60, b = 0.00 }
PowerBarColor["FUEL"] = { r = 0.0, g = 0.55, b = 0.5 }
PowerBarColor["STAGGER"] = { { r = 0.52, g = 1.0, b = 0.52 }, { r = 1.0, g = 0.98, b = 0.72 }, { r = 1.0, g = 0.42, b = 0.42 } }
for index, token in pairs({ [0] = "MANA", "RAGE", "FOCUS", "ENERGY", "CHI", nil, "RUNIC_POWER", "SOUL_SHARDS",
  "LUNAR_POWER", "HOLY_POWER", nil, "MAELSTROM", nil, "INSANITY", nil, nil, nil, "FURY", "PAIN" }) do
  PowerBarColor[index] = PowerBarColor[token]
end

-- UNVERIFIED: reputations and currencies through the classic globals. The 2.5.6 API docs give C_Reputation only
-- the functions below (no GetNumFactions, GetFactionDataByIndex, GetReputationSortType, …), so WeakAuras2's
-- Compatibility.lua must see the others as absent and take its GetFactionInfo paths. The simulated character
-- has no factions and no currencies.
do
  local documented = { GetFactionParagonInfo = true, GetGuildFactionData = true, GetWatchedFactionData = true,
    IsAccountWideReputation = true, IsFactionParagon = true, IsFactionParagonForCurrentPlayer = true,
    IsMajorFaction = true, RequestFactionParagonPreloadRewardData = true }
  C_Reputation = setmetatable({}, { __index = function(t, k)
    if not documented[k] then return nil end
    local stub = S.makeStub("C_Reputation." .. tostring(k))
    rawset(t, k, stub)
    return stub
  end })
end
function GetNumFactions() return 0 end
function GetCurrencyListSize() return 0 end

-- UNVERIFIED: no hardcore realms on TBC Anniversary (C_GameRules.IsHardcoreActive exists in the 2.5.6 API docs).
-- Transmission.lua compresses exports at level 1 instead of 9 when this is true, so it decides the codes we write.
C_GameRules = S.stubFallback({ IsHardcoreActive = function() return false end }, "C_GameRules")

-- UNVERIFIED: no class specializations on TBC (classic talents; WeakAuras2's TBC load options have no spec).
-- The 2.5.6 API docs do list C_SpecializationInfo; its spec queries are answered "none" so the addon takes its
-- classic paths, as for Forever, instead of the auto-stub's "exists, returns nil".
local noSpecs = { GetSpecialization = true, GetNumSpecializationsForClassID = true, GetActiveSpecGroup = true,
  GetSpecializationInfo = true, GetTalentInfo = true }
C_SpecializationInfo = setmetatable({}, { __index = function(t, k)
  if noSpecs[k] then return nil end
  local stub = S.makeStub("C_SpecializationInfo." .. tostring(k))
  rawset(t, k, stub)
  return stub
end })
-- Assigning nil leaves a global to the auto-stub; nilGlobals makes it read as absent.
for _, name in ipairs({ "GetSpecializationInfoForClassID", "C_Traits", "C_ClassTalents" }) do
  S.nilGlobals[name] = true
  _G[name] = nil
end

-- UNVERIFIED: no secret values on TBC Anniversary (the 2.5.6 API docs carry no SecretsDocumentation and almost no
-- secret annotations). WeakAuras2 never asks C_Secrets; it reads as absent rather than as an auto-stub.
S.nilGlobals.C_Secrets = true
C_Secrets = nil

-- UNVERIFIED: the client's SecondsFormatter (a native API on 2.5.6: SecondsFormatterAPIDocumentation.lua), which
-- WeakAuras2's Types.lua builds its time text formatter from. Only what Types.lua uses: Init, Format and the
-- interval descriptions (largest unit that fits, then the next one, as "1d 2h" / "5m 3s"). It shapes %p-style
-- time text only; the simulator draws timer text itself.
do
  local Abbreviation = { None = 0, Truncate = 1, OneLetter = 2 }
  SecondsFormatter = {
    Abbreviation = Abbreviation,
    Interval = { Seconds = 1, Minutes = 2, Hours = 3, Days = 4 },
    IntervalDescription = {
      { seconds = 1, formatString = { "%d Seconds", "%d Sec", "%ds" } },
      { seconds = 60, formatString = { "%d Minutes", "%d Min", "%dm" } },
      { seconds = 3600, formatString = { "%d Hours", "%d Hr", "%dh" } },
      { seconds = 86400, formatString = { "%d Days", "%d Day", "%dd" } },
    },
  }
  SecondsFormatterMixin = {}
  function SecondsFormatterMixin:Init(approximationSeconds, defaultAbbreviation, roundUpLastUnit, convertToLower)
    self.approximationSeconds = approximationSeconds or 0
    self.defaultAbbreviation = defaultAbbreviation or Abbreviation.None
  end
  function SecondsFormatterMixin:GetIntervalDescription(interval) return SecondsFormatter.IntervalDescription[interval] end
  function SecondsFormatterMixin:GetMaxInterval() return #SecondsFormatter.IntervalDescription end
  function SecondsFormatterMixin:Format(seconds, abbreviation)
    seconds = math.max(0, math.floor(tonumber(seconds) or 0))
    local which = (abbreviation or self.defaultAbbreviation or Abbreviation.None) + 1
    local parts = {}
    for interval = self:GetMaxInterval(), 1, -1 do
      local d = self:GetIntervalDescription(interval)
      local n = math.floor(seconds / d.seconds)
      if n > 0 or (interval == 1 and #parts == 0) then
        parts[#parts + 1] = string.format(d.formatString[which] or d.formatString[1], n)
        seconds = seconds - n * d.seconds
        if #parts == 2 then break end
      end
    end
    return table.concat(parts, " ")
  end
end

function __profile.afterLoad() end
`;
