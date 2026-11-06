-- Extraction API over the loaded addon. Everything returns plain tables; JS gets them via __bridge.json.
-- (a) registries(), (b) prepare()/validate(), (c) options().

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

-- Find a file-local table by name: scan the upvalues of every function reachable from `roots`.
-- (Used for registries the addon keeps in locals, e.g. SecretAuraConditions.lua VARIABLES.)
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

---------------------------------------------------------------------------------------------------
-- (a) registries
---------------------------------------------------------------------------------------------------
local function resolveValues(values)
  -- prototype args name their value list as a string key into Private (e.g. "unit_types")
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

function X.registries()
  local R = {
    addonVersion = __shim.toc.WeakAuras and __shim.toc.WeakAuras.Version,
    versionString = WeakAuras.versionString,
    internalVersion = WeakAuras.InternalVersion(),
    data_stub = P.data_stub,
    regionTypes = {}, subRegionTypes = {}, triggerTypes = {}, eventPrototypes = {},
  }
  local regionNames = {}
  for name, rt in pairs(P.regionTypes) do
    regionNames[#regionNames + 1] = name
    -- Condition properties depend on the aura (triggers, sub-regions), so ask the addon's own
    -- Private.GetProperties for a minimal prepared aura of this type with a classic aura trigger.
    local d = X.prepare({ id = "__props_" .. name, regionType = name, internalVersion = WeakAuras.InternalVersion(),
      triggers = { { trigger = { type = "aura2", unit = "player", debuffType = "HELPFUL" }, untrigger = {} } } })
    local ok, props = pcall(P.GetProperties, d)
    R.regionTypes[name] = { default = rt.default, properties = ok and props or nil,
      propertiesError = not ok and tostring(props) or nil,
      propertiesIsFunction = type(rt.properties) == "function", hasValidate = rt.validate ~= nil }
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
          local parent = X.prepare({ id = "__props_" .. rn, regionType = rn, internalVersion = WeakAuras.InternalVersion(),
            triggers = { { trigger = { type = "aura2", unit = "player", debuffType = "HELPFUL" }, untrigger = {} } },
            subRegions = { sub } })
          local ok3, r = pcall(props, parent, 1)
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
      hasEvents = proto.events ~= nil, args = prototypeArgs(proto.args),
    }
  end
  R.eventCategories = P.event_categories
  -- Load tab prototype (same arg format)
  R.loadPrototype = P.load_prototype and { args = prototypeArgs(P.load_prototype.args) }

  -- secretAura ("Aura (Modern)") registries
  local D = P.BlizzardAuraDisplay
  R.secretAura = {
    units = D.units, booleanFilters = D.booleanFilters, nativeFilters = D.nativeFilters,
    dispelTypes = D.dispelTypes, sortMethods = D.sortMethods, processedTypes = D.processedTypes,
    processingOptions = D.processingOptions, showOnValues = D.showOnValues,
    singleUnits = D.singleUnits, approximateUnits = D.approximateUnits, missingTypes = D.missingTypes,
    remOperators = D.remOperators, totalOperators = D.totalOperators, stackOperators = D.stackOperators,
    STACK_LIMIT = D.STACK_LIMIT, dynamicGroupWarning = D.dynamicGroupWarning,
    supportedRegionTypes = {},
    supportsDurationColorCondition = D.SupportsDurationColorCondition and D.SupportsDurationColorCondition(),
  }
  for _, rn in ipairs(regionNames) do
    if D.SupportsRegionType(rn) then table.insert(R.secretAura.supportedRegionTypes, rn) end
  end
  -- File-local registries of SecretAuraConditions.lua, reached through function upvalues.
  local roots = { D, P.AuraSingleShared or {}, P.AuraDisplayShared or {} }
  for _, local_name in ipairs({ "VARIABLES", "ROOT_PROPERTIES", "ELEMENT_PROPERTIES", "HIGHLIGHT_SET",
    "MISSING_ROOT_NAMES", "TIME_OPERATORS" }) do
    local t = X.findUpvalue(local_name, roots)
    R.secretAura[local_name] = t or "<not found>"
  end
  return R
end

---------------------------------------------------------------------------------------------------
-- (b) defaults, migration, validation
---------------------------------------------------------------------------------------------------
local function captureErrors(fn)
  local before = #(__shim.errors or {})
  local beforePrints = #(__shim.prints or {})
  local r = B.try(fn)
  local errs, prints = {}, {}
  for i = before + 1, #(__shim.errors or {}) do errs[#errs + 1] = __shim.errors[i].err end
  for i = beforePrints + 1, #(__shim.prints or {}) do prints[#prints + 1] = __shim.prints[i] end
  return r, errs, prints
end

-- Fill defaults and migrate exactly like the addon does on import/login: WeakAuras.PreAdd runs
-- Modernize, BlizzardAuraDisplay.Migrate, region defaults, region validate, data_stub and sub-region defaults.
function X.prepare(data)
  data = deepcopy(data)
  local r, errs, prints = captureErrors(function() WeakAuras.PreAdd(data) end)
  return data, { ok = r.ok, error = r.error, handlerErrors = errs, prints = prints }
end

local function stripColor(s)
  if type(s) ~= "string" then return s end
  return (s:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))
end

function X.validate(data)
  local D = P.BlizzardAuraDisplay
  local res = { eligible = D.Eligible(data) and true or false }
  local v = B.try(D.Validate, data)
  res.validate = B.result(v)
  local trig = D.GetTrigger(data)
  if trig then
    local s = B.try(D.TriggerStatus, data, trig)
    res.triggerStatus = s.ok and s.value or { error = s.error }
    res.triggerStatusPlain = s.ok and stripColor(s.value) or nil
    local single = B.try(D.ValidateSingle, data, trig)
    res.validateSingle = B.result(single)
    local cond = B.try(D.ValidateConditions, data)
    res.validateConditions = B.result(cond)
  end
  -- The addon's own warning list (Private.AuraWarnings) for a registered aura. The options addon's
  -- TriggerSecretWarnings adds "SecretTrigger" for classic triggers whose values the client hides in
  -- combat; its answers come from C_Secrets queries, i.e. from the client profile.
  local registered = data.uid and P.GetDataByUID and P.GetDataByUID(data.uid)
  if registered then
    if OP and OP.TriggerSecretWarnings and OP.Private then
      B.try(OP.TriggerSecretWarnings.UpdateAuraWarning, registered)
    end
    local w = B.try(P.AuraWarnings.GetAllWarnings, data.uid)
    if w.ok then
      res.auraWarnings = {}
      for severity, warning in pairs(w.value or {}) do
        res.auraWarnings[#res.auraWarnings + 1] = { key = warning.key, severity = severity,
          message = stripColor(warning.message) }
      end
    else
      res.auraWarnings = { error = w.error }
    end
  end
  return res
end

---------------------------------------------------------------------------------------------------
-- (c) options tables
---------------------------------------------------------------------------------------------------
local optionsReady = false
function X.setupOptions()
  if optionsReady then return { ok = true } end
  -- What WeakAuras.ToggleOptions does the first time, minus opening the window.
  OP.Private = P
  local errors = {}
  for i, fn in ipairs(OP.registerRegions or {}) do
    local r = B.try(fn)
    if not r.ok then errors[#errors + 1] = "registerRegions[" .. i .. "]: " .. r.error:sub(1, 300) end
  end
  optionsReady = true
  -- Collapsible sections hide their options through OptionsPrivate.IsCollapsed (UI state kept in
  -- WeakAurasOptionsSaved). Expand everything so `hidden` reflects only the addon's option logic.
  OP.IsCollapsed = function() return false end
  local regionOptions = {}
  for k in pairs(P.regionOptions or {}) do regionOptions[#regionOptions + 1] = k end
  table.sort(regionOptions)
  return { ok = #errors == 0, errors = errors, regionOptions = regionOptions }
end

-- Register the aura (WeakAuras.Add: the addon's own full add path, regions included).
function X.add(data)
  local r, errs, prints = captureErrors(function() WeakAuras.Add(data) end)
  return { ok = r.ok, error = r.error, handlerErrors = errs, prints = prints }
end

X.tabs = {
  { key = "region", fn = "GetDisplayOptions", label = "Display" },
  { key = "trigger", fn = "GetTriggerOptions", label = "Trigger" },
  { key = "conditions", fn = "GetConditionOptions", label = "Conditions" },
  { key = "action", fn = "GetActionOptions", label = "Actions" },
  { key = "animation", fn = "GetAnimationOptions", label = "Animations" },
  { key = "load", fn = "GetLoadOptions", label = "Load" },
  { key = "authorOptions", fn = "GetAuthorOptions", label = "Custom Options" },
  { key = "information", fn = "GetInformationOptions", label = "Information" },
}

-- Apply an edit through the option's own set() (as AceConfigDialog would), e.g.
-- setOption(id, "trigger", {"trigger.1.secretAura.useRem"}, true). Returns the updated aura.
function X.setOption(id, tabKey, path, ...)
  local data = WeakAuras.GetData(id)
  local fnName
  for _, tab in ipairs(X.tabs) do if tab.key == tabKey then fnName = tab.fn end end
  if OP.commonOptionsCache and OP.commonOptionsCache.Clear then OP.commonOptionsCache:Clear() end
  local root = OP[fnName](data)
  local node, inherited = root, { set = root.set, handler = root.handler }
  for _, key in ipairs(path) do
    node = node.args and node.args[key]
    if not node then return { error = "no option at " .. table.concat(path, "/") } end
    if node.set then inherited.set = node.set end
    if node.handler then inherited.handler = node.handler end
  end
  local info = { options = root, option = node, arg = node.arg, handler = inherited.handler, type = node.type,
    uiType = "dialog", uiName = "WeakAuras", appName = "WeakAuras" }
  for i, p in ipairs(path) do info[i] = p end
  local set = node.set or inherited.set
  if type(set) ~= "function" then return { error = "option has no set function" } end
  local r = B.try(set, info, ...)
  if not r.ok then return { error = r.error } end
  return { ok = true, data = WeakAuras.GetData(id) }
end

function X.options(id, onlyTab)
  local data = WeakAuras.GetData(id)
  local out = {}
  for _, tab in ipairs(X.tabs) do
    if not onlyTab or onlyTab == tab.key then
      local fn = OP[tab.fn]
      local entry = { label = WeakAuras.L[tab.label] or tab.label, fn = tab.fn }
      if type(fn) ~= "function" then
        entry.error = "missing OptionsPrivate." .. tab.fn
      else
        if OP.commonOptionsCache and OP.commonOptionsCache.Clear then OP.commonOptionsCache:Clear() end
        local t0 = os.clock()
        local r = B.try(fn, data)
        if not r.ok then
          entry.error = r.error
        else
          local tree, stats = B.evalOptions(r.value)
          entry.tree = tree
          entry.stats = stats
        end
        entry.ms = math.floor((os.clock() - t0) * 1000)
      end
      out[tab.key] = entry
    end
  end
  return out
end
