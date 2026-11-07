/**
 * WoW API shim for running Musca Auras headlessly.
 * Lua source as a string so it bundles for Node, the browser and Web Workers alike.
 */
export const SHIM_LUA = String.raw`-- WoW API shim for loading Musca Auras headlessly in wasmoon-lua5.1.
--
-- Two layers:
--   1. Real shims for the APIs whose *values* matter (string helpers, build info, addon
--      metadata, player identity, screen size, timers, events, mock frames).
--   2. A permissive auto-stub: any other global that is read returns a "stub" object that can be
--      indexed (returns child stubs), called (returns nil), concatenated and tostring'd. Every
--      access is logged per file in __shim.touched so we can see which APIs the addon really needs.
--
-- The loader sets __shim.toc[addon] to each .toc's metadata before running that addon's files.
-- Answers that decide validation live in the Forever client profile (profile.ts), not here.

__shim = __shim or {}
local S = __shim
S.touched = {}       -- "path" -> { count = n, files = { [file] = true } }
S.currentFile = "?"
S.frames = {}        -- every mock frame created
S.eventFrames = {}   -- event -> { frame = true }
S.timers = {}        -- pending C_Timer / AceTimer callbacks (run by __shim.tick, bridge.ts)
S.toc = S.toc or {}
-- WeakAurasArchive is a data-only addon (SavedVariables); pretend it is loaded.
S.loadedAddons = { WeakAurasArchive = true }

local function touch(path)
  local t = S.touched[path]
  if not t then
    t = { count = 0, files = {} }
    S.touched[path] = t
  end
  t.count = t.count + 1
  t.files[S.currentFile] = true
end

---------------------------------------------------------------------------------------------------
-- Auto-stub objects
---------------------------------------------------------------------------------------------------
local stubPath = setmetatable({}, { __mode = "k" })
local stubMT = {}
local function isStub(v) return type(v) == "table" and stubPath[v] ~= nil end
S.isStub = isStub

local function makeStub(path)
  local s = setmetatable({}, stubMT)
  stubPath[s] = path
  return s
end
S.makeStub = makeStub

stubMT.__index = function(t, k)
  local p = stubPath[t] .. "." .. tostring(k)
  touch(p)
  local child = makeStub(p)
  rawset(t, k, child)
  return child
end
stubMT.__call = function(t, ...)
  local p = stubPath[t]
  touch(p .. "()")
  -- Count queries (GetNumShapeshiftForms, C_X.GetNumY, ...) answer 0 so "for i = 1, GetNumX()" works.
  if p:match("GetNum[%w]*$") or p:match("Count$") then return 0 end
  return nil
end
stubMT.__tostring = function(t) return stubPath[t] end
stubMT.__concat = function(a, b) return tostring(a) .. tostring(b) end
local function zero() return 0 end
stubMT.__add, stubMT.__sub, stubMT.__mul, stubMT.__div, stubMT.__mod, stubMT.__pow, stubMT.__unm =
  zero, zero, zero, zero, zero, zero, zero
stubMT.__len = zero

---------------------------------------------------------------------------------------------------
-- WoW string and table helpers (the plain Lua aliases and bit are in lua-stdlib.ts, run first)
---------------------------------------------------------------------------------------------------
function strtrim(s, chars)
  chars = chars and ("[" .. chars:gsub("[%]%^%-]", "%%%0") .. "]") or "%s"
  return (s:gsub("^" .. chars .. "+", ""):gsub(chars .. "+$", ""))
end
string.trim = strtrim
function strsplit(sep, s, limit)
  if s == nil then return nil end
  local out, pos, n = {}, 1, 0
  local pattern = "[" .. sep:gsub("[%]%^%-%%]", "%%%0") .. "]"
  while true do
    if limit and n == limit - 1 then break end
    local a, b = string.find(s, pattern, pos)
    if not a then break end
    out[#out + 1] = string.sub(s, pos, a - 1)
    n = n + 1
    pos = b + 1
  end
  out[#out + 1] = string.sub(s, pos)
  return unpack(out)
end
string.split = function(s, sep, limit) return strsplit(sep, s, limit) end
function strsplittable(sep, s, limit) return { strsplit(sep, s, limit) } end
function strjoin(sep, ...) return table.concat({ ... }, sep) end
string.join = strjoin
function strconcat(...) return table.concat({ ... }) end
function strlenutf8(s) local _, n = s:gsub("[^\128-\191]", "") return n end
function strcmputf8i(a, b) a, b = a:lower(), b:lower() return a < b and -1 or (a > b and 1 or 0) end
function tostringall(...)
  local n = select("#", ...)
  local t = { ... }
  for i = 1, n do t[i] = tostring(t[i]) end
  return unpack(t, 1, n)
end
-- WoW's xpcall forwards extra arguments to f (Lua 5.2 style); plain Lua 5.1 drops them silently.
do
  local xpcall51 = xpcall
  function xpcall(f, handler, ...)
    local n = select("#", ...)
    if n == 0 then return xpcall51(f, handler) end
    local args = { ... }
    return xpcall51(function() return f(unpack(args, 1, n)) end, handler)
  end
end
function ipairs_reverse(t)
  local i = #t + 1
  return function() i = i - 1 if i > 0 then return i, t[i] end end
end
function tContains(t, v) for _, x in pairs(t) do if x == v then return true end end return false end
function tInvert(t) local r = {} for k, v in pairs(t) do r[v] = k end return r end
function tIndexOf(t, v) for i, x in ipairs(t) do if x == v then return i end end end
function tFilter(t, pred, isIndexTable)
  local r = {}
  for k, v in pairs(t) do if pred(v) then if isIndexTable then r[#r + 1] = v else r[k] = v end end end
  return r
end
function tAppendAll(t, s) for _, v in ipairs(s) do t[#t + 1] = v end end
function tUnorderedRemove(t, i) t[i] = t[#t] t[#t] = nil end
function CopyTable(t, shallow)
  local r = {}
  for k, v in pairs(t) do
    if type(v) == "table" and not shallow then r[k] = CopyTable(v) else r[k] = v end
  end
  return r
end
function Mixin(object, ...)
  for i = 1, select("#", ...) do
    local mixin = select(i, ...)
    for k, v in pairs(mixin) do object[k] = v end
  end
  return object
end
function CreateFromMixins(...) return Mixin({}, ...) end
function CreateAndInitFromMixin(mixin, ...) local o = CreateFromMixins(mixin) if o.Init then o:Init(...) end return o end
function GetValueOrCallFunction(t, k, ...) local v = t[k] if type(v) == "function" then return v(...) end return v end
function Clamp(v, lo, hi) return math.min(hi, math.max(lo, v)) end
function Saturate(v) return Clamp(v, 0, 1) end
function Lerp(a, b, t) return a + (b - a) * t end
function Round(v) return math.floor(v + 0.5) end
function FormatLargeNumber(n) return tostring(n) end
function AbbreviateNumbers(n) return tostring(n) end
function AbbreviateLargeNumbers(n) return tostring(n) end
function BreakUpLargeNumbers(n) return tostring(n) end
function SecondsToTime(s) return tostring(s) .. " sec" end
function debugstack() return "" end
function debuglocals() return "" end
local errorHandler = function(err) S.errors = S.errors or {} table.insert(S.errors, { file = S.currentFile, err = tostring(err) }) end
function geterrorhandler() return errorHandler end
function seterrorhandler(f) errorHandler = f end
function securecall(f, ...) if type(f) == "string" then f = _G[f] end return f(...) end
function securecallfunction(f, ...) return f(...) end
function secureexecuterange(t, f, ...) for k, v in pairs(t) do f(k, v, ...) end end
function issecure() return false end
function issecurevariable() return false, nil end
function issecretvalue(_) return false end
function issecrettable(_) return false end
function canaccessvalue(_) return true end
function canaccesstable(_) return true end
function canaccesssecrets() return true end
function hooksecurefunc(a, b, c)
  local t, name, hook = _G, a, b
  if type(a) == "table" then t, name, hook = a, b, c end
  local orig = t[name]
  if type(orig) ~= "function" then return end
  t[name] = function(...) local r = { orig(...) } hook(...) return unpack(r) end
end
function forceinsecure() end
function scrub(...) return ... end
function GetTime() return S.now or 1000 end
function GetTimePreciseSec() return GetTime() end
function GetServerTime() return os.time() end
function debugprofilestop() return os.clock() * 1000 end
function debugprofilestart() end
function print(...) S.prints = S.prints or {} table.insert(S.prints, table.concat({ tostringall(...) }, " ")) end

---------------------------------------------------------------------------------------------------
-- Build / client identity
---------------------------------------------------------------------------------------------------
function GetBuildInfo() return "1.60.1", "60000", "Nov 1 2026", 16001, "", "", 16001 end
WOW_PROJECT_MAINLINE, WOW_PROJECT_CLASSIC, WOW_PROJECT_BURNING_CRUSADE_CLASSIC = 1, 2, 5
WOW_PROJECT_WRATH_CLASSIC, WOW_PROJECT_CATACLYSM_CLASSIC, WOW_PROJECT_MISTS_CLASSIC = 11, 14, 19
WOW_PROJECT_ID = WOW_PROJECT_CLASSIC
LE_EXPANSION_LEVEL_CURRENT = 0
function GetLocale() return "enUS" end
function GetCurrentRegion() return 3 end
function GetRealmName() return "Forever" end
function GetNormalizedRealmName() return "Forever" end
function UnitName(unit) if unit == "player" then return "Simulator", nil end end
function UnitGUID(unit) if unit == "player" then return "Player-0-00000001" end end
function UnitClass(unit) if unit == "player" then return "Warrior", "WARRIOR", 1 end end
function UnitClassBase(unit) if unit == "player" then return "WARRIOR", 1 end end
function UnitRace(unit) if unit == "player" then return "Human", "Human", 1 end end
function UnitFactionGroup(unit) if unit == "player" then return "Alliance", "Alliance" end end
function UnitLevel() return 60 end
-- Unit values for triggers that read them when added (a full, idle player).
function UnitHealth() return 1000 end
function UnitHealthMax() return 1000 end
function UnitPower() return 100 end
function UnitPowerMax() return 100 end
function UnitPowerType() return 0, "MANA" end
function UnitExists(unit) return unit == "player" end
function UnitIsUnit(a, b) return a == b end
function UnitInRaid() return nil end
function UnitInParty() return false end
function IsInGroup() return false end
function IsInRaid() return false end
function GetNumGroupMembers() return 0 end
function InCombatLockdown() return S.inCombat or false end
function UnitAffectingCombat() return S.inCombat or false end
function IsLoggedIn() return S.loggedIn or false end
-- The global environment (LibUIDropDownMenu looks its named frames up in it).
function GetCurrentEnvironment() return _G end
function GetScreenWidth() return 1920 end
function GetScreenHeight() return 1080 end
function GetPhysicalScreenSize() return 1920, 1080 end
function GetCVar(_) return nil end
function GetCVarBool(_) return false end
function SetCVar() end
function IsAddOnLoaded(name) return S.loadedAddons[name] or false end
function GetAddOnMetadata(name, field) local t = S.toc[name] return t and t[field] end
function GetNumAddOns() return 2 end
function GetAddOnInfo(name) return name, name, "", true, nil, nil, false end
function GetAddOnEnableState() return 2 end
function EnableAddOn() end
function LoadAddOn(name) return S.loadedAddons[name] and true or false, S.loadedAddons[name] and nil or "MISSING" end
C_AddOns = {
  GetAddOnMetadata = GetAddOnMetadata,
  IsAddOnLoaded = IsAddOnLoaded,
  GetNumAddOns = GetNumAddOns,
  GetAddOnInfo = GetAddOnInfo,
  GetAddOnEnableState = GetAddOnEnableState,
  EnableAddOn = EnableAddOn,
  DisableAddOn = function() end,
  LoadAddOn = LoadAddOn,
  IsAddOnLoadOnDemand = function() return false end,
  DoesAddOnExist = function(name) return S.toc[name] ~= nil end,
}

-- Spell API: answers come from S.spells (JS can fill it from the spell cache); otherwise nil.
S.spells = S.spells or {}
local function spellInfo(id)
  local s = S.spells[tonumber(id) or id]
  if s then return { name = s.name, iconID = s.icon, originalIconID = s.icon, spellID = s.id, castTime = 0, minRange = 0, maxRange = 0 } end
end
C_Spell = {
  GetSpellInfo = spellInfo,
  GetSpellName = function(id) local s = spellInfo(id) return s and s.name end,
  GetSpellTexture = function(id) local s = spellInfo(id) return s and s.iconID, s and s.iconID end,
  DoesSpellExist = function(id) return spellInfo(id) ~= nil end,
  IsSpellUsable = function() return false, false end,
  GetSpellCooldown = function() return nil end,
  GetSpellCharges = function() return nil end,
  GetSpellDescription = function() return "" end,
  GetSpellLink = function() return nil end,
  IsSpellPassive = function() return false end,
  GetOverrideSpell = function(id) return id end,
}
function GetSpellInfo(id) local s = spellInfo(id) if s then return s.name, nil, s.iconID, 0, 0, 0, s.spellID end end
function GetSpellTexture(id) local s = spellInfo(id) return s and s.iconID end
function IsSpellKnown() return false end
function IsPlayerSpell() return false end

-- Timers: recorded; __shim.tick (bridge.ts) fires the due ones
local function newTimer(delay, cb, iterations)
  local handle = { delay = delay, cb = cb, iterations = iterations, cancelled = false }
  function handle:Cancel() self.cancelled = true end
  function handle:IsCancelled() return self.cancelled end
  table.insert(S.timers, handle)
  return handle
end
C_Timer = {
  After = function(d, cb) newTimer(d, cb, 1) end,
  NewTimer = function(d, cb) return newTimer(d, cb, 1) end,
  NewTicker = function(d, cb, n) return newTimer(d, cb, n) end,
}

---------------------------------------------------------------------------------------------------
-- Mock frames
---------------------------------------------------------------------------------------------------
-- A mock frame records scripts, events, points and size. Unknown methods are heuristic:
--   Create*  -> a new mock frame (textures, font strings, animation groups, ...)
--   Get*Width/Height/Scale/Alpha -> numbers; other Get*/Is*/Has* -> nil; everything else -> no-op.
local frameMethods = {}
local frameMT = {}
local frameNames = setmetatable({}, { __mode = "k" })

local function newFrame(kind, name, parent)
  local f = setmetatable({}, frameMT)
  rawset(f, "__kind", kind or "Frame")
  rawset(f, "__scripts", {})
  rawset(f, "__events", {})
  rawset(f, "__w", 0)
  rawset(f, "__h", 0)
  rawset(f, "__shown", true)
  rawset(f, "__parent", parent)
  rawset(f, "__children", {})
  if parent and type(parent) == "table" and rawget(parent, "__children") then
    table.insert(rawget(parent, "__children"), f)
  end
  if name and type(name) == "string" then
    name = name:gsub("%$parent", parent and frameNames[parent] or "")
    frameNames[f] = name
    rawset(_G, name, f)
  end
  table.insert(S.frames, f)
  return f
end
S.newFrame = newFrame

function frameMethods:GetName() return frameNames[self] end
function frameMethods:GetObjectType() return rawget(self, "__kind") end
function frameMethods:IsObjectType(t) return rawget(self, "__kind") == t end
function frameMethods:IsForbidden() return false end
function frameMethods:SetScript(name, fn) rawget(self, "__scripts")[name] = fn end
function frameMethods:GetScript(name) return rawget(self, "__scripts")[name] end
function frameMethods:HookScript(name, fn)
  local scripts = rawget(self, "__scripts")
  local old = scripts[name]
  scripts[name] = old and function(...) old(...) fn(...) end or fn
end
function frameMethods:HasScript() return true end
function frameMethods:RegisterEvent(e)
  rawget(self, "__events")[e] = true
  S.eventFrames[e] = S.eventFrames[e] or {}
  S.eventFrames[e][self] = true
end
frameMethods.RegisterUnitEvent = frameMethods.RegisterEvent
function frameMethods:UnregisterEvent(e)
  rawget(self, "__events")[e] = nil
  if S.eventFrames[e] then S.eventFrames[e][self] = nil end
end
function frameMethods:UnregisterAllEvents()
  for e in pairs(rawget(self, "__events")) do self:UnregisterEvent(e) end
end
function frameMethods:IsEventRegistered(e) return rawget(self, "__events")[e] == true end
function frameMethods:SetSize(w, h) rawset(self, "__w", w) rawset(self, "__h", h) end
function frameMethods:SetWidth(w) rawset(self, "__w", w) end
function frameMethods:SetHeight(h) rawset(self, "__h", h) end
function frameMethods:GetWidth() return rawget(self, "__w") end
function frameMethods:GetHeight() return rawget(self, "__h") end
function frameMethods:GetSize() return rawget(self, "__w"), rawget(self, "__h") end
function frameMethods:GetScale() return 1 end
function frameMethods:GetEffectiveScale() return 1 end
function frameMethods:GetAlpha() return 1 end
function frameMethods:GetEffectiveAlpha() return 1 end
function frameMethods:GetFrameLevel() return 1 end
function frameMethods:GetFrameStrata() return "MEDIUM" end
function frameMethods:GetNumPoints() return 0 end
function frameMethods:GetLeft() return 0 end
function frameMethods:GetRight() return 0 end
function frameMethods:GetTop() return 0 end
function frameMethods:GetBottom() return 0 end
function frameMethods:GetCenter() return 0, 0 end
function frameMethods:GetRect() return 0, 0, 0, 0 end
function frameMethods:GetParent() return rawget(self, "__parent") end
function frameMethods:SetParent(p) rawset(self, "__parent", p) end
function frameMethods:GetChildren() return unpack(rawget(self, "__children")) end
function frameMethods:GetNumChildren() return #rawget(self, "__children") end
function frameMethods:GetRegions() return end
function frameMethods:Show() rawset(self, "__shown", true) end
function frameMethods:Hide() rawset(self, "__shown", false) end
function frameMethods:SetShown(v) rawset(self, "__shown", not not v) end
function frameMethods:IsShown() return rawget(self, "__shown") end
function frameMethods:IsVisible() return rawget(self, "__shown") end
function frameMethods:GetText() return rawget(self, "__text") end
function frameMethods:SetText(t) rawset(self, "__text", t) end
function frameMethods:SetFormattedText(fmt, ...) rawset(self, "__text", string.format(fmt, ...)) end
function frameMethods:GetStringWidth() return 0 end
function frameMethods:GetStringHeight() return 0 end
function frameMethods:GetFont() return "Fonts\\FRIZQT__.TTF", 12, "" end
function frameMethods:SetFont() return true end
function frameMethods:GetTextColor() return 1, 1, 1, 1 end
function frameMethods:GetVertexColor() return 1, 1, 1, 1 end
function frameMethods:GetTexCoord() return 0, 0, 0, 1, 1, 0, 1, 1 end
function frameMethods:GetMinMaxValues() return 0, 1 end
function frameMethods:GetValue() return 0 end
function frameMethods:GetCursorPosition() return 0 end
function frameMethods:GetNumLetters() return 0 end
function frameMethods:GetDuration() return 0 end
function frameMethods:GetCooldownTimes() return 0, 0 end
function frameMethods:GetCooldownDuration() return 0 end
function frameMethods:GetAttribute(k) local a = rawget(self, "__attr") return a and a[k] end
function frameMethods:SetAttribute(k, v) local a = rawget(self, "__attr") or {} rawset(self, "__attr", a) a[k] = v end
function frameMethods:GetID() return rawget(self, "__id") or 0 end
function frameMethods:SetID(v) rawset(self, "__id", v) end

-- AnimationGroup:CreateAnimation / GetAnimations (Widget API): the group's animations, in the order made.
function frameMethods:CreateAnimation(kind, name, ...)
  local a = newFrame(kind or "Animation", name, self)
  local list = rawget(self, "__animations") or {}
  rawset(self, "__animations", list)
  list[#list + 1] = a
  return a
end
function frameMethods:GetAnimations() return unpack(rawget(self, "__animations") or {}) end

-- Widget API methods start with a verb; anything else read from a frame is a plain field (nil).
local methodVerbs = { "Set", "Get", "Is", "Has", "Enable", "Disable", "Register", "Unregister", "Clear",
  "Create", "Show", "Hide", "Start", "Stop", "Play", "Pause", "Raise", "Lower", "Add", "Remove", "Hook",
  "Lock", "Unlock", "Can", "Apply", "Adjust", "Insert", "Scroll", "Update", "Refresh", "Reset", "Toggle",
  "Highlight", "Unhighlight", "Click", "Fire", "Restart", "Finish", "Release", "Acquire", "Select",
  "Init", "Flash", "Load", "Mark", "Clamp", "Fade", "Attach", "Detach", "Animate", "Resume",
  "Cancel", "Execute", "Run", "Invoke", "Calculate", "Mask", "Make", "Do", "Save", "Restore" }
local function isMethodName(k)
  for _, v in ipairs(methodVerbs) do
    if k:sub(1, #v) == v and (#k == #v or k:sub(#v + 1, #v + 1):match("[A-Z0-9]")) then return true end
  end
  return false
end
local childGetterSuffixes = { "Texture", "FontString", "Region", "Frame", "Button", "Bar", "FontObject", "Animation", "Font" }
-- Methods of one widget type (S.kindMethods[kind][name]), for widgets whose methods have effects the
-- addon checks (the profile fills these in). They win over the generic methods below.
S.kindMethods = {}
frameMT.__index = function(t, k)
  local own = S.kindMethods[rawget(t, "__kind")]
  if own and own[k] then return own[k] end
  local m = frameMethods[k]
  if m then return m end
  if type(k) ~= "string" or not isMethodName(k) then return nil end
  touch("Frame:" .. k)
  local fn
  local isChildGetter = false
  if k:match("^Get") then
    for _, suf in ipairs(childGetterSuffixes) do
      if k:sub(-#suf) == suf then isChildGetter = true end
    end
  end
  local isNumberGetter = false
  if k:match("^Get") then
    for _, suf in ipairs({ "Width", "Height", "Range", "Scroll", "Offset", "Level", "Value", "Scale", "Alpha",
      "Count", "Rotation", "Spacing", "Inset", "Duration", "Time", "Elapsed", "Progress", "Index", "Number",
      "Position", "Left", "Right", "Top", "Bottom", "Padding", "Delay", "Order" }) do
      if k:sub(-#suf) == suf then isNumberGetter = true end
    end
  end
  if k:match("^Create") then
    fn = function(self, name, ...) return newFrame(k:sub(7), name, self) end
  elseif isNumberGetter then
    fn = function() return 0 end
  elseif isChildGetter then
    -- child objects the caller will configure next: create once per frame
    fn = function(self)
      local cache = rawget(self, "__getters") or {}
      rawset(self, "__getters", cache)
      cache[k] = cache[k] or newFrame(k:sub(4), nil, self)
      return cache[k]
    end
  else
    fn = function() return nil end
  end
  frameMethods[k] = fn
  return fn
end

function CreateFrame(kind, name, parent, template)
  local f = newFrame(kind, name, parent)
  return f
end
function CreateFont(name) return newFrame("Font", name) end
function CreateFontFamily(name) return newFrame("Font", name) end
UIParent = newFrame("Frame", "UIParent")
UIParent:SetSize(1920, 1080)
WorldFrame = newFrame("Frame", "WorldFrame")
GameTooltip = newFrame("GameTooltip", "GameTooltip")
GameFontNormal = newFrame("Font", "GameFontNormal")
GameFontHighlight = newFrame("Font", "GameFontHighlight")
GameFontNormalSmall = newFrame("Font", "GameFontNormalSmall")
GameFontHighlightSmall = newFrame("Font", "GameFontHighlightSmall")
ChatFontNormal = newFrame("Font", "ChatFontNormal")
STANDARD_TEXT_FONT = "Fonts\\FRIZQT__.TTF"
UNIT_NAME_FONT = "Fonts\\FRIZQT__.TTF"
DAMAGE_TEXT_FONT = "Fonts\\FRIZQT__.TTF"
NAMEPLATE_FONT = "Fonts\\FRIZQT__.TTF"
StaticPopupDialogs = {}
function StaticPopup_Show() end
function StaticPopup_Hide() end
UISpecialFrames = {}
SlashCmdList = {}
hash_SlashCmdList = {}
NUM_BAG_SLOTS = 4
MAX_PARTY_MEMBERS = 4
MAX_RAID_MEMBERS = 40
MAX_BOSS_FRAMES = 5
MAX_PLAYER_LEVEL = 60
RAID_CLASS_COLORS = setmetatable({}, { __index = function(t, k)
  local c = { r = 1, g = 1, b = 1, colorStr = "ffffffff" }
  function c:GenerateHexColor() return "ffffffff" end
  function c:WrapTextInColorCode(s) return s end
  rawset(t, k, c) return c end })
for _, c in ipairs({ "WARRIOR", "PALADIN", "HUNTER", "ROGUE", "PRIEST", "SHAMAN", "MAGE", "WARLOCK", "DRUID" }) do
  local _ = RAID_CLASS_COLORS[c]
end
CLASS_SORT_ORDER = { "WARRIOR", "PALADIN", "HUNTER", "ROGUE", "PRIEST", "SHAMAN", "MAGE", "WARLOCK", "DRUID" }
LOCALIZED_CLASS_NAMES_MALE = {}
LOCALIZED_CLASS_NAMES_FEMALE = {}
for _, c in ipairs(CLASS_SORT_ORDER) do
  local n = c:sub(1, 1) .. c:sub(2):lower()
  LOCALIZED_CLASS_NAMES_MALE[c] = n
  LOCALIZED_CLASS_NAMES_FEMALE[c] = n
end
function GetClassInfo(i) local c = CLASS_SORT_ORDER[i] if c then return LOCALIZED_CLASS_NAMES_MALE[c], c, i end end
function GetNumClasses() return #CLASS_SORT_ORDER end
CLASS_ICON_TCOORDS = setmetatable({}, { __index = function() return { 0, 1, 0, 1 } end })

-- Color helpers used by Blizzard UI code
local colorMixin = {}
function colorMixin:GetRGB() return self.r, self.g, self.b end
function colorMixin:GetRGBA() return self.r, self.g, self.b, self.a end
function colorMixin:GenerateHexColor() return string.format("ff%02x%02x%02x", self.r * 255, self.g * 255, self.b * 255) end
function colorMixin:GenerateHexColorMarkup() return "|c" .. self:GenerateHexColor() end
function colorMixin:WrapTextInColorCode(s) return "|c" .. self:GenerateHexColor() .. s .. "|r" end
function colorMixin:SetRGBA(r, g, b, a) self.r, self.g, self.b, self.a = r, g, b, a end
function colorMixin:SetRGB(r, g, b) self.r, self.g, self.b = r, g, b end
ColorMixin = colorMixin
function WrapTextInColorCode(text, colorHex) return "|c" .. tostring(colorHex) .. tostring(text) .. "|r" end
function CreateColor(r, g, b, a) return setmetatable({ r = r, g = g, b = b, a = a or 1 }, { __index = colorMixin }) end
NORMAL_FONT_COLOR = CreateColor(1, 0.82, 0)
HIGHLIGHT_FONT_COLOR = CreateColor(1, 1, 1)
RED_FONT_COLOR = CreateColor(1, 0.1, 0.1)
GREEN_FONT_COLOR = CreateColor(0.1, 1, 0.1)
GRAY_FONT_COLOR = CreateColor(0.5, 0.5, 0.5)
WHITE_FONT_COLOR = CreateColor(1, 1, 1)
DISABLED_FONT_COLOR = CreateColor(0.5, 0.5, 0.5)
function CreateVector2D(x, y) return { x = x, y = y, GetXY = function(s) return s.x, s.y end } end
function CreateTexturePool() return { Acquire = function() return newFrame("Texture") end, ReleaseAll = function() end, Release = function() end } end
function CreateFramePool(kind) return { Acquire = function() return newFrame(kind or "Frame") end, ReleaseAll = function() end, Release = function() end, EnumerateActive = function() return function() end end } end
-- FrameXML's ObjectPool: Release resets an object and keeps it for the next Acquire. WeakAuras keeps its sub
-- elements in these pools; an editor that loads thousands of aura states (the option reference) would otherwise
-- make new frames for every one.
function CreateObjectPool(create, reset)
  local pool = { active = {}, inactive = {}, numActive = 0 }
  function pool:Acquire()
    local obj = table.remove(self.inactive)
    local new = obj == nil
    if new then obj = create(self) end
    self.active[obj] = true
    self.numActive = self.numActive + 1
    return obj, new
  end
  function pool:Release(obj)
    if not self.active[obj] then return false end
    if reset then reset(self, obj) end
    self.active[obj] = nil
    self.numActive = self.numActive - 1
    table.insert(self.inactive, obj)
    return true
  end
  function pool:ReleaseAll()
    local list = {}
    for obj in pairs(self.active) do list[#list + 1] = obj end
    for _, obj in ipairs(list) do self:Release(obj) end
  end
  function pool:EnumerateActive() return pairs(self.active) end
  function pool:GetNumActive() return self.numActive end
  return pool
end
function CreateCallbackRegistry() return {} end

-- Static game data the option lists are built from (Load tab classes/races). Vanilla-era IDs.
local CLASS_IDS = { WARRIOR = 1, PALADIN = 2, HUNTER = 3, ROGUE = 4, PRIEST = 5, SHAMAN = 7, MAGE = 8, WARLOCK = 9, DRUID = 11 }
local RACES = { [1] = { "Human", "Human" }, [2] = { "Orc", "Orc" }, [3] = { "Dwarf", "Dwarf" },
  [4] = { "Night Elf", "NightElf" }, [5] = { "Undead", "Scourge" }, [6] = { "Tauren", "Tauren" },
  [7] = { "Gnome", "Gnome" }, [8] = { "Troll", "Troll" } }
C_CreatureInfo = {
  GetClassInfo = function(id)
    for file, cid in pairs(CLASS_IDS) do
      if cid == id then return { className = LOCALIZED_CLASS_NAMES_MALE[file], classFile = file, classID = cid } end
    end
  end,
  GetRaceInfo = function(id)
    local r = RACES[id]
    if r then return { raceName = r[1], clientFileString = r[2], raceID = id } end
  end,
}
function GetClassInfo(id)
  local info = C_CreatureInfo.GetClassInfo(id)
  if info then return info.className, info.classFile, info.classID end
end
function GetNumClasses() return 11 end

-- Real namespaces fall back to (logged) stubs for members we didn't shim.
function S.stubFallback(tbl, name)
  return setmetatable(tbl, { __index = function(t, k)
    local p = name .. "." .. tostring(k)
    touch(p)
    local s = makeStub(p)
    rawset(t, k, s)
    return s
  end })
end
for _, name in ipairs({ "C_AddOns", "C_Spell", "C_Timer", "C_CreatureInfo" }) do S.stubFallback(_G[name], name) end

---------------------------------------------------------------------------------------------------
-- Global auto-stub
---------------------------------------------------------------------------------------------------
-- Globals that must read as nil (the addon's own saved variables and optional third-party addons).
local nilGlobals = {
  WeakAurasSaved = true, WeakAurasOptionsSaved = true, WeakAurasArchive = true,
  Masque = true, BigWigs = true, BigWigsLoader = true, DBM = true, GTFO = true, ElvUI = true,
  Plater = true, CustomNames = true, WeakAurasCompanion = true, WeakAurasCompanionData = true,
  ChatThrottleLib = true, OmniCC = true, TukUI = true, Tukui = true, Bartender4 = true, Dominos = true,
  SharedMedia = true, Details = true, Questie = true, CUSTOM_CLASS_COLORS = true,
}
S.nilGlobals = nilGlobals

setmetatable(_G, {
  __index = function(t, k)
    if type(k) ~= "string" then return nil end
    if nilGlobals[k] or k:match("^WeakAuras") or k:match("^__") or k:match("Lib") then
      touch("nil:" .. k)
      return nil
    end
    touch(k)
    -- ALL_CAPS globals are almost always Blizzard GlobalStrings or numeric constants: give them a
    -- string value equal to their name so they work in concatenation, comparisons and string.format.
    if k:match("^[A-Z][A-Z0-9_]+$") and not k:match("^C_") and not k:match("^LE_") then
      rawset(t, k, k)
      return k
    end
    local s = makeStub(k)
    rawset(t, k, s)
    return s
  end,
})
`;
