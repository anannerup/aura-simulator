/**
 * The core's entry points inside the addon VM:
 * contract check, registries, fill defaults, validate. This is the part every WeakAuras has; a game's own part
 * (lua/extract-forever.ts for Musca Auras) is loaded after it and adds to X.registryParts / X.validateParts.
 * Every addon internal used here is listed in the common contract (contract.ts); keep the two in step.
 */
export const EXTRACT_LUA = String.raw`
__extract = {}
local X = __extract
local P = __shim.private.WeakAuras
local OP = __shim.private.WeakAurasOptions
local B = __bridge

local function deepcopy(t, seen)
  if type(t) ~= "table" then return t end
  seen = seen or {}
  if seen[t] then return seen[t] end
  local r = {}
  seen[t] = r
  for k, v in pairs(t) do r[deepcopy(k, seen)] = deepcopy(v, seen) end
  return r
end
X.deepcopy = deepcopy

-- Finds a file-local table by name: scans the upvalues of every function reachable from roots.
function X.findUpvalue(name, roots)
  local seenFn, seenTbl = {}, {}
  local found
  local function scanFn(fn, depth)
    if seenFn[fn] or found then return end
    seenFn[fn] = true
    local i = 1
    while true do
      local n, v = debug.getupvalue(fn, i)
      if not n then break end
      if n == name and type(v) == "table" then found = v return end
      if type(v) == "function" and depth < 3 then scanFn(v, depth + 1) end
      i = i + 1
    end
  end
  local function scanTbl(t, depth)
    if seenTbl[t] or found or depth > 2 then return end
    seenTbl[t] = true
    for _, v in pairs(t) do
      if type(v) == "function" then scanFn(v, 0)
      elseif type(v) == "table" and not __shim.isStub(v) then scanTbl(v, depth + 1) end
      if found then return end
    end
  end
  for _, r in ipairs(roots) do scanTbl(r, 0) end
  return found
end

-- Filled by the game's part (loaded after this): the tables whose functions' upvalues hold the contract's
-- file-local tables, extra registries (part(R, regionNames)) and extra validation (part(data, res)).
function X.upvalueRoots() return {} end
X.registryParts = {}
X.validateParts = {}

---------------------------------------------------------------------------------------------------
-- Contract: everything below that the core relies on. Returns the list of missing names.
---------------------------------------------------------------------------------------------------
local function lookup(root, path)
  local v = root
  for part in path:gmatch("[^.]+") do
    if type(v) ~= "table" then return nil end
    v = rawget(v, part)
  end
  return v
end

function X.checkContract(contract)
  local roots = { WeakAuras = WeakAuras, Private = P, OptionsPrivate = OP }
  local missing = {}
  for _, entry in ipairs(contract.values) do
    local rootName, rest = entry.name:match("^([^.]+)%.(.+)$")
    local v = roots[rootName] and lookup(roots[rootName], rest)
    if v == nil or __shim.isStub(v) or (entry.kind == "function" and type(v) ~= "function")
      or (entry.kind == "table" and type(v) ~= "table") then
      missing[#missing + 1] = entry.name
    end
  end
  if #missing == 0 then
    for _, name in ipairs(contract.upvalues) do
      if not X.findUpvalue(name, X.upvalueRoots()) then missing[#missing + 1] = "upvalue " .. name end
    end
  end
  return missing
end

---------------------------------------------------------------------------------------------------
-- Aura warnings: mirror every UpdateWarning so all warnings of an aura can be read back
-- (GetAllWarnings keeps only one per severity).
---------------------------------------------------------------------------------------------------
X.warnings = {}
function X.installWarningRecorder()
  local original = P.AuraWarnings.UpdateWarning
  P.AuraWarnings.UpdateWarning = function(uid, key, severity, message, ...)
    if uid then
      X.warnings[uid] = X.warnings[uid] or {}
      if severity and message then
        X.warnings[uid][key] = { severity = severity, message = message }
      else
        X.warnings[uid][key] = nil
      end
    end
    return original(uid, key, severity, message, ...)
  end
end

---------------------------------------------------------------------------------------------------
-- Registries
---------------------------------------------------------------------------------------------------
local function resolveValues(values)
  if type(values) == "string" then
    local v = P[values]
    if type(v) == "function" then local ok, r = pcall(v) v = ok and r or nil end
    return v, values
  elseif type(values) == "function" then
    local ok, r = pcall(values)
    return ok and r or nil, "<function>"
  end
  return values
end

local function prototypeArgs(args)
  local out = {}
  for i, arg in ipairs(args or {}) do
    local a = {}
    for k, v in pairs(arg) do
      if k == "values" then
        a.values, a.valuesKey = resolveValues(v)
      elseif type(v) == "function" then
        a[k] = "<function>"
      else
        a[k] = v
      end
    end
    out[i] = a
  end
  return out
end

local captureErrors

function X.registries()
  local R = {
    addonVersion = __shim.toc.WeakAuras and __shim.toc.WeakAuras.Version,
    versionString = WeakAuras.versionString,
    internalVersion = WeakAuras.InternalVersion(),
    data_stub = P.data_stub,
    regionTypes = {}, subRegionTypes = {}, triggerTypes = {}, eventPrototypes = {},
  }
  local regionNames = {}
  local function propsAura(name, subRegions)
    return X.prepare({ id = "__props_" .. name, regionType = name, internalVersion = WeakAuras.InternalVersion(),
      triggers = { { trigger = { type = "aura2", unit = "player", debuffType = "HELPFUL" }, untrigger = {} } },
      subRegions = subRegions })
  end
  for name, rt in pairs(P.regionTypes) do
    regionNames[#regionNames + 1] = name
    local ok, props = pcall(P.GetProperties, propsAura(name))
    R.regionTypes[name] = { default = rt.default, properties = ok and props or nil,
      propertiesError = not ok and tostring(props) or nil }
  end
  table.sort(regionNames)
  for name, st in pairs(P.subRegionTypes) do
    local entry = { displayName = st.displayName, supports = {}, defaults = {}, properties = {} }
    for _, rn in ipairs(regionNames) do
      local ok, sup = pcall(st.supports, rn)
      if ok and sup then
        entry.supports[#entry.supports + 1] = rn
        local def = st.default
        if type(def) == "function" then
          local ok2, r = pcall(def, rn)
          def = ok2 and r or { __error = tostring(r) }
        end
        entry.defaults[rn] = def
        local props = st.properties
        if type(props) == "function" then
          local sub = deepcopy(type(def) == "table" and def or {})
          sub.type = name
          local ok3, r = pcall(props, propsAura(rn, { sub }), 1)
          props = ok3 and r or { __error = tostring(r) }
        end
        entry.properties[rn] = props
      end
    end
    R.subRegionTypes[name] = entry
  end
  for name in pairs(P.triggerTypes) do R.triggerTypes[#R.triggerTypes + 1] = name end
  table.sort(R.triggerTypes)
  for name, proto in pairs(P.event_prototypes) do
    R.eventPrototypes[name] = {
      name = proto.name, type = proto.type, statesParameter = proto.statesParameter,
      progressType = proto.progressType, timedrequired = proto.timedrequired,
      args = prototypeArgs(proto.args),
    }
  end
  R.eventCategories = P.event_categories
  R.loadPrototype = P.load_prototype and { args = prototypeArgs(P.load_prototype.args) }
  R.media = X.media()
  for _, part in ipairs(X.registryParts) do part(R, regionNames) end
  return R
end

---------------------------------------------------------------------------------------------------
-- Defaults and migration: WeakAuras.PreAdd runs Modernize (and Musca's BlizzardAuraDisplay.Migrate), region
-- defaults, region validate, data_stub and sub-region defaults, exactly as on import.
---------------------------------------------------------------------------------------------------
function captureErrors(fn)
  local errors = __shim.errors or {}
  __shim.errors = errors
  local prints = __shim.prints or {}
  __shim.prints = prints
  local before, beforePrints = #errors, #prints
  local r = B.try(fn)
  local errs, out = {}, {}
  for i = before + 1, #errors do errs[#errs + 1] = errors[i].err end
  for i = beforePrints + 1, #prints do out[#out + 1] = prints[i] end
  return r, errs, out
end

function X.prepare(data)
  data = deepcopy(data)
  if data.internalVersion == nil then data.internalVersion = WeakAuras.InternalVersion() end
  local r, errs, prints = captureErrors(function() WeakAuras.PreAdd(data) end)
  return data, { ok = r.ok, error = r.error, handlerErrors = errs, prints = prints }
end

---------------------------------------------------------------------------------------------------
-- Validation
---------------------------------------------------------------------------------------------------
local function stripColor(s)
  if type(s) ~= "string" then return s end
  return (s:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))
end

-- "|cffRRGGBBtext|r rest" -> { "text", "rest" }: one entry per painted segment of a status line.
local function segments(s)
  local out = {}
  for colored in s:gmatch("|c%x%x%x%x%x%x%x%x(.-)|r") do out[#out + 1] = colored end
  return out
end

local function safe(fn, ...)
  local ok, r = pcall(fn, ...)
  if ok then return r end
  return nil, tostring(r)
end

local function listOf(t)
  local out = {}
  for i, v in ipairs(type(t) == "table" and t or {}) do out[i] = v end
  return out
end
X.stripColor, X.segments, X.safe, X.listOf = stripColor, segments, safe, listOf

local validateCounter = 0

-- Registers a copy of the aura with WeakAuras.Add (the addon's own add path) and returns the
-- warnings the addon raised for it, then removes it again.
local function addWarnings(data)
  validateCounter = validateCounter + 1
  local copy = deepcopy(data)
  copy.id = "__aurasim_validate_" .. validateCounter
  copy.uid = "__aurasimV" .. validateCounter
  copy.parent = nil
  copy.controlledChildren = nil
  local r, errs, prints = captureErrors(function() WeakAuras.Add(copy) end)
  local list = {}
  for key, w in pairs(X.warnings[copy.uid] or {}) do
    list[#list + 1] = { key = key, severity = w.severity, message = stripColor(w.message) }
  end
  table.sort(list, function(a, b) return a.key < b.key end)
  local registered = WeakAuras.GetData(copy.id)
  if registered then captureErrors(function() WeakAuras.Delete(registered) end) end
  X.warnings[copy.uid] = nil
  return list, { ok = r.ok, error = r.error, handlerErrors = errs, prints = prints }
end
---------------------------------------------------------------------------------------------------
-- LibSharedMedia: the media lists of a client with only this addon installed (the game's own media and what the
-- addon registers), and the media names an aura uses that aren't in them.
---------------------------------------------------------------------------------------------------
local MEDIA_TYPES = { "font", "border", "background", "statusbar", "sound" }

local function sharedMedia() return LibStub and LibStub("LibSharedMedia-3.0", true) end

-- { font = { list = { {name, file}, ... sorted by name }, default = "Friz Quadrata TT" }, ... }
function X.media()
  local LSM = sharedMedia()
  if not LSM then return nil end
  local out = {}
  for _, kind in ipairs(MEDIA_TYPES) do
    local list = {}
    for _, name in ipairs(LSM:List(kind) or {}) do
      list[#list + 1] = { name = name, file = LSM:HashTable(kind)[name] }
    end
    out[kind] = { list = list, default = LSM.DefaultMedia[kind] }
  end
  return out
end

-- The keys the addon reads through SharedMedia:Fetch (RegionTypes/Text.lua, AuraBar.lua, Group.lua,
-- DynamicGroup.lua, Model.lua; SubRegionTypes/SubText.lua, Border.lua): key -> media type.
local REGION_MEDIA = { font = "font", borderEdge = "border", borderBackdrop = "background" }
local SUB_MEDIA = { text_font = "font", border_edge = "border" }

-- Media names in the aura that the client's LibSharedMedia doesn't have: the game then draws the type's default
-- (or, for a bar texture, the default bar). { kind, name, key, sub?, default }
function X.unknownMedia(data)
  local LSM = sharedMedia()
  if not LSM then return {} end
  local out = {}
  local function check(kind, name, key, sub)
    if type(name) ~= "string" or name == "" or name == "None" then return end
    if LSM:IsValid(kind, name) then return end
    if kind == "statusbar" and LSM:IsValid("statusbar_atlas", name) then return end
    out[#out + 1] = { kind = kind, name = name, key = key, sub = sub, default = LSM.DefaultMedia[kind] }
  end
  for key, kind in pairs(REGION_MEDIA) do check(kind, data[key], key) end
  if data.regionType == "aurabar" and data.textureSource ~= "Picker" then check("statusbar", data.texture, "texture") end
  for i, sub in ipairs(type(data.subRegions) == "table" and data.subRegions or {}) do
    if type(sub) == "table" then
      for key, kind in pairs(SUB_MEDIA) do check(kind, sub[key], key, i) end
    end
  end
  table.sort(out, function(a, b)
    if (a.sub or 0) ~= (b.sub or 0) then return (a.sub or 0) < (b.sub or 0) end
    return a.key < b.key
  end)
  return out
end

function X.validate(input)
  local data, prep = X.prepare(input)
  local res = { prepare = prep, regionType = data.regionType, unknownMedia = X.unknownMedia(data) }
  for _, part in ipairs(X.validateParts) do part(data, res) end
  if data.regionType ~= "group" and data.regionType ~= "dynamicgroup" then
    res.auraWarnings, res.add = addWarnings(data)
  end
  return res
end
`;
