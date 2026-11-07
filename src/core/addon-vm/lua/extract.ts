/**
 * The core's entry points inside the addon VM (grown from prototypes/headless-addon/extract.lua):
 * contract check, registries, fill defaults, validate. Every addon internal used here is listed in
 * the contract (contract.ts); keep the two in step.
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

local function upvalueRoots()
  local D = P and P.BlizzardAuraDisplay
  return { D or {}, P and P.AuraSingleShared or {}, P and P.AuraDisplayShared or {} }
end

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
      if not X.findUpvalue(name, upvalueRoots()) then missing[#missing + 1] = "upvalue " .. name end
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

  local D = P.BlizzardAuraDisplay
  R.secretAura = {
    units = D.units, booleanFilters = D.booleanFilters, nativeFilters = D.nativeFilters,
    dispelTypes = D.dispelTypes, sortMethods = D.sortMethods, processedTypes = D.processedTypes,
    processingOptions = D.processingOptions, showOnValues = D.showOnValues,
    singleUnits = D.singleUnits, approximateUnits = D.approximateUnits, missingTypes = D.missingTypes,
    remOperators = D.remOperators, totalOperators = D.totalOperators, stackOperators = D.stackOperators,
    STACK_LIMIT = D.STACK_LIMIT, missingRootProperties = D.missingRootProperties,
    supportedRegionTypes = {},
    supportsDurationColorCondition = D.SupportsDurationColorCondition and D.SupportsDurationColorCondition() or false,
  }
  for _, rn in ipairs(regionNames) do
    if D.SupportsRegionType(rn) then table.insert(R.secretAura.supportedRegionTypes, rn) end
  end
  for _, localName in ipairs({ "VARIABLES", "ROOT_PROPERTIES", "ELEMENT_PROPERTIES", "HIGHLIGHT_SET",
    "MISSING_ROOT_NAMES", "TIME_OPERATORS" }) do
    R.secretAura[localName] = X.findUpvalue(localName, upvalueRoots())
  end
  return R
end

---------------------------------------------------------------------------------------------------
-- Defaults and migration: WeakAuras.PreAdd runs Modernize, BlizzardAuraDisplay.Migrate, region
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

-- Index of the trigger Aura (Modern) shows (its progress source).
local function sourceTriggerIndex(data)
  local D = P.BlizzardAuraDisplay
  local source = D.GetSavedTrigger(data)
  if not source then return nil end
  for i, entry in ipairs(data.triggers or {}) do
    if entry.trigger == source then return i end
  end
end

local function validateMessage(data)
  local message = safe(P.BlizzardAuraDisplay.Validate, data)
  return message
end

-- Which part of the aura causes 'message'? Tries the aura without parts of it and looks for the
-- part whose removal makes the message go away. Returns a blame table (indexes into 'data').
local function blame(data, message)
  local D = P.BlizzardAuraDisplay
  local conditions = listOf(data.conditions)
  if #conditions > 0 and safe(D.ValidateConditions, data) == message then
    -- First condition whose prefix already shows the message.
    for i = 1, #conditions do
      local copy = deepcopy(data)
      copy.conditions = {}
      for k = 1, i do copy.conditions[k] = deepcopy(conditions[k]) end
      if safe(D.ValidateConditions, copy) == message then
        local condition = conditions[i]
        local changes = listOf(condition.changes)
        for j, change in ipairs(changes) do
          if change.property ~= nil and not safe(D.NativeConditionAllowsProperty, data, condition.check, change.property) then
            return { kind = "change", condition = i, change = j, property = change.property, propertyAllowed = false }
          end
        end
        for j = 1, #changes do
          local c2 = deepcopy(copy)
          c2.conditions[i].changes = {}
          for k = 1, j do c2.conditions[i].changes[k] = deepcopy(changes[k]) end
          if safe(D.ValidateConditions, c2) == message then
            return { kind = "change", condition = i, change = j, property = changes[j].property }
          end
        end
        return { kind = "condition", condition = i }
      end
    end
    return { kind = "conditions" }
  end
  local without = deepcopy(data)
  without.actions = nil
  if data.actions and validateMessage(without) ~= message then return { kind = "actions" } end
  without = deepcopy(data)
  without.animation = nil
  if data.animation and validateMessage(without) ~= message then return { kind = "animation" } end
  local appearance = safe(D.ValidateAppearance, safe(D.PrepareConditionAppearance, data) or data)
  if appearance == message then return { kind = "display" } end
  if data.regionType == "progresstexture" then
    without = deepcopy(data)
    without.orientation = "HORIZONTAL"
    if validateMessage(without) ~= message then return { kind = "display", property = "orientation" } end
  end
  return { kind = "trigger", trigger = sourceTriggerIndex(data) }
end

-- Removes the blamed change or condition so the next problem can be found. Returns false when the
-- blamed part can't be taken out (trigger, display, actions).
local function removeBlamed(data, b, map)
  if b.kind == "change" then
    table.remove(data.conditions[b.condition].changes, b.change)
    table.remove(map.changes[b.condition], b.change)
    return true
  elseif b.kind == "condition" then
    table.remove(data.conditions, b.condition)
    table.remove(map.conditions, b.condition)
    table.remove(map.changes, b.condition)
    return true
  end
  return false
end

-- All Aura (Modern) problems, first to last, each with the option that causes it.
local function modernProblems(data)
  local work = deepcopy(data)
  local map = { conditions = {}, changes = {} }
  for i, condition in ipairs(listOf(work.conditions)) do
    map.conditions[i] = i
    map.changes[i] = {}
    for j in ipairs(listOf(condition.changes)) do map.changes[i][j] = j end
  end
  local problems = {}
  for _ = 1, 20 do
    local message = validateMessage(work)
    if not message then break end
    local b = blame(work, message)
    local entry = { message = message, kind = b.kind, trigger = b.trigger, property = b.property,
      propertyAllowed = b.propertyAllowed }
    if b.condition then
      entry.condition = map.conditions[b.condition]
      if b.change then entry.change = map.changes[b.condition][b.change] end
    end
    problems[#problems + 1] = entry
    if not removeBlamed(work, b, map) then break end
  end
  return problems
end

-- Warnings the options addon shows when the game hides values of a classic trigger in combat
-- (TriggerSecretWarnings), asked per trigger with the client profile in combat.
local function combatTriggerWarnings(data)
  local W = OP and OP.TriggerSecretWarnings
  local out = {}
  if not W then return out end
  OP.Private = OP.Private or P
  __profile.combat = true
  for i, entry in ipairs(listOf(data.triggers)) do
    local trigger = type(entry) == "table" and entry.trigger
    if type(trigger) == "table" and trigger.type ~= "secretAura" then
      local secretSpell = safe(W.HasSecretAuraSpell, trigger) and true or false
      -- The scope logic reads trigger.event; only ask it when that event belongs to the trigger's
      -- type. (Every trigger carries the data_stub's event = "Health", also aura and item triggers.)
      local proto = trigger.event and P.event_prototypes[trigger.event]
      local scope
      if trigger.type == "custom" or (proto and proto.type == trigger.type) then
        scope = safe(W.GetScope, data, i)
      end
      if secretSpell or scope then
        out[#out + 1] = { trigger = i, triggerType = trigger.type, secretSpell = secretSpell,
          scope = scope, message = stripColor(W.message),
          casterOnly = scope ~= nil and scope == WeakAuras.L["Caster unit checks:"],
          casterMessage = stripColor(W.casterText) }
      end
    end
  end
  __profile.combat = false
  return out
end

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

function X.validate(input)
  local D = P.BlizzardAuraDisplay
  local data, prep = X.prepare(input)
  local res = { prepare = prep, regionType = data.regionType }
  res.hasModernTrigger = safe(D.HasTrigger, data) and true or false
  res.eligible = safe(D.Eligible, data) and true or false
  if res.eligible then
    res.sourceTrigger = sourceTriggerIndex(data)
    res.problems = modernProblems(data)
    local trigger = D.GetTrigger(data)
    local status, err = safe(D.TriggerStatus, data, trigger)
    res.status = status and stripColor(status) or nil
    res.statusError = err
    res.statusSegments = status and segments(status) or {}
  elseif res.hasModernTrigger and data.regionType ~= "group" and data.regionType ~= "dynamicgroup" then
    res.notEligible = validateMessage(data)
    res.regionSupported = D.SupportsRegionType(data.regionType) and true or false
  end
  res.combatTriggers = combatTriggerWarnings(data)
  if data.regionType ~= "group" and data.regionType ~= "dynamicgroup" then
    res.auraWarnings, res.add = addWarnings(data)
  end
  return res
end
`;
