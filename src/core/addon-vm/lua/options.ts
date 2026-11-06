/**
 * The options editor's entry points inside the addon VM: builds the in-game options tabs for one
 * aura with WeakAurasOptions' own generators (OptionsPrivate.Get*Options), evaluates them the way
 * AceConfigDialog does (names, values, ranges, hidden, disabled, current value from get()), and
 * applies edits through the options' own set()/func(). Grown from prototypes/headless-addon.
 *
 * Paths: option keys with `tostring(table)` in them (condition options) change on every build, so
 * every key is normalised (`table: 0x…` → `@`) and resolved again against a fresh build.
 */
export const OPTIONS_LUA = String.raw`
__options = {}
local O = __options
local P = __shim.private.WeakAuras
local OP = __shim.private.WeakAurasOptions
local B = __bridge
local X = __extract
local deepcopy = X.deepcopy

-- Option tables the headless window has built (EnsureOptions), per aura id and tab.
O.optionCache = {}

-- Tabs and generators, read from the options window's own source by the JS side (tabs.ts) and set here.
O.tabs = {}

-- The aura being edited: registered with WeakAuras.Add (the addon's add path), found again by uid.
local session -- { uid, input = <the document as the page holds it> }
local uidCounter = 0

local function currentData()
  if not session then return nil end
  return P.GetDataByUID and P.GetDataByUID(session.uid) or nil
end

local ready = false
local setupErrors = {}
local function setup()
  if ready then return end
  ready = true
  OP.Private = OP.Private or P
  -- What WeakAuras.ToggleOptions does the first time (minus the window): register region options.
  for i, fn in ipairs(OP.registerRegions or {}) do
    local r = B.try(fn)
    if not r.ok then setupErrors[#setupErrors + 1] = "registerRegions[" .. i .. "]: " .. r.error:sub(1, 300) end
  end
  O.installWindow()
end

-- A headless options window. Option set()/func() code refreshes the window after an edit
-- (OptionsPrivate.ClearOptions, WeakAuras.ClearAndUpdateOptions, FillOptions, ResetMoverSizer, …
-- all call methods on WeakAurasOptions.lua's file-local 'frame', which is nil until the window is
-- opened). The stand-in has every method (CamelCase key) as a no-op, no fields, and answers the
-- few questions option code asks it.
function O.installWindow()
  local anchor = OP.ClearOptions
  if type(anchor) ~= "function" then return end
  local i = 1
  while true do
    local name, value = debug.getupvalue(anchor, i)
    if not name then return end
    if name == "frame" then
      if value ~= nil then return end
      break
    end
    i = i + 1
  end
  local methods = {
    IsVisible = function() return false end,
    IsShown = function() return false end,
    GetPickedDisplay = function() local d = currentData() return d and d.id end,
    GetTargetAura = function() local d = currentData() return d and d.id end,
    -- Like the window: one option table per aura and tab, until the options are cleared.
    EnsureOptions = function(_, data, tab)
      local id = data and data.id
      if id == nil then return nil end
      O.optionCache[id] = O.optionCache[id] or {}
      local cached = O.optionCache[id][tab]
      if cached then return cached end
      local t = O.tabs[tab]
      local fn = t and OP[t.fn]
      if type(fn) ~= "function" then return nil end
      cached = fn(data)
      O.optionCache[id][tab] = cached
      return cached
    end,
    ClearOptions = function(_, id) if id ~= nil then O.optionCache[id] = nil end end,
    ClearAndUpdateOptions = function(_, id) if id ~= nil then O.optionCache[id] = nil end end,
  }
  local noop = function() end
  local window = setmetatable({}, { __index = function(_, k)
    if methods[k] then return methods[k] end
    if type(k) == "string" and k:match("^%u") then return noop end
    return nil
  end })
  debug.setupvalue(anchor, i, window)
end

---------------------------------------------------------------------------------------------------
-- Loading the aura being edited
---------------------------------------------------------------------------------------------------

local function deleteCurrent()
  local data = currentData()
  if data then pcall(WeakAuras.Delete, data) end
  session = nil
end

-- Registers the aura (and, for a group, its children first) and makes it the edited aura.
function O.load(input, children)
  setup()
  deleteCurrent()
  for _, child in ipairs(children or {}) do
    local c = X.prepare(child)
    pcall(WeakAuras.Add, c)
  end
  local data = X.prepare(input)
  if type(data.uid) ~= "string" then
    uidCounter = uidCounter + 1
    data.uid = "__aurasimE" .. uidCounter
  end
  local r = B.try(WeakAuras.Add, data)
  session = { uid = data.uid, input = deepcopy(input) }
  if not currentData() then
    session = nil
    return { ok = false, error = r.error or "The addon did not register the aura" }
  end
  return { ok = true }
end

---------------------------------------------------------------------------------------------------
-- Option tables -> plain data
---------------------------------------------------------------------------------------------------
local function normKey(k)
  return (tostring(k):gsub("%a+: 0x%x+", "@"):gsub("%a+: %x%x%x%x%x%x%x%x+", "@"))
end

-- A value's label. Two-column dropdowns (WeakAurasTwoColumnDropdown) use { group, item } pairs.
local function labelOf(label, key)
  if type(label) == "string" or type(label) == "number" then return tostring(label) end
  if type(label) == "table" then
    local parts = {}
    for _, v in ipairs(label) do
      if type(v) == "string" or type(v) == "number" then parts[#parts + 1] = tostring(v) end
    end
    if #parts > 0 then return table.concat(parts, " – ") end
  end
  return tostring(key)
end

local function sortKeys(x, y)
  local a, b = tonumber(x), tonumber(y)
  if a and b then return a < b end
  return tostring(x) < tostring(y)
end

local function buildRoot(tabKey)
  local data = currentData()
  if not data then return nil, "No aura is loaded in the editor" end
  local tab = O.tabs[tabKey]
  if not tab then return nil, "Unknown tab " .. tostring(tabKey) end
  local fn = OP[tab.fn]
  if type(fn) ~= "function" then return nil, "OptionsPrivate." .. tab.fn .. " is missing in this addon version" end
  if OP.commonOptionsCache and OP.commonOptionsCache.Clear then pcall(OP.commonOptionsCache.Clear, OP.commonOptionsCache) end
  O.optionCache = {}
  local r = B.try(fn, data)
  if not r.ok then return nil, r.error end
  if type(r.value) ~= "table" then return nil, "OptionsPrivate." .. tab.fn .. " returned no options" end
  return r.value
end

local inheritFields = { "get", "set", "hidden", "disabled", "handler", "func", "validate" }

local function makeInfo(root, keys, option, inherited)
  local info = { options = root, option = option, arg = option.arg, handler = inherited.handler,
    type = option.type, uiType = "dialog", uiName = "WeakAuras", appName = "WeakAuras" }
  for i, k in ipairs(keys) do info[i] = k end
  return info
end

-- Calls an AceConfig member: a value, a function(info) or a method name on the handler.
local function member(value, info, handler, ...)
  if type(value) == "function" then
    local ok, a, b, c, d = pcall(value, info, ...)
    if not ok then return nil, tostring(a) end
    return a, nil, b, c, d
  elseif type(value) == "string" and handler and type(handler[value]) == "function" then
    local ok, a, b, c, d = pcall(handler[value], handler, info, ...)
    if not ok then return nil, tostring(a) end
    return a, nil, b, c, d
  end
  return value
end

local function shortError(e) return (tostring(e):gsub("^[^:]*:%d+: ", "")):sub(1, 300) end

local plainFields = { "name", "desc", "width", "min", "max", "softMin", "softMax", "step", "bigStep",
  "isPercent", "hasAlpha", "multiline", "fontSize", "inline", "confirmText" }

local function evalNode(root, option, keys, ids, inherited, depth)
  local inh = {}
  for _, f in ipairs(inheritFields) do
    if option[f] ~= nil then inh[f] = option[f] else inh[f] = inherited[f] end
  end
  local info = makeInfo(root, keys, option, inh)
  local out = { type = option.type, order = tonumber(option.order) or 100, path = { unpack(ids) } }
  out.key = ids[#ids]
  local errors
  local function fail(field, e)
    errors = errors or {}
    errors[field] = shortError(e)
  end
  for _, f in ipairs(plainFields) do
    if option[f] ~= nil then
      local v, e = member(option[f], info, inh.handler)
      if e then fail(f, e) elseif type(v) ~= "function" and type(v) ~= "table" then out[f] = v end
    end
  end
  if option.inline ~= nil then out.inline = option.inline and true or false end
  if option.control then out.control = option.control end
  if option.dialogControl then out.dialogControl = option.dialogControl end
  if option.image ~= nil then
    local v, e, w, h = member(option.image, info, inh.handler)
    if not e and (type(v) == "string" or type(v) == "number") then
      out.image = tostring(v)
      out.imageWidth = tonumber(w) or tonumber(option.imageWidth)
      out.imageHeight = tonumber(h) or tonumber(option.imageHeight)
    end
  end
  if depth > 0 then
    for _, f in ipairs({ "hidden", "disabled" }) do
      local v = option[f]
      if v == nil then v = inh[f] end
      if v ~= nil then
        local r, e = member(v, info, inh.handler)
        if e then fail(f, e) else out[f] = r and true or false end
      end
    end
  end
  -- values (select, multiselect), ordered the way AceGUI's dropdown orders them
  local valuesTable
  if option.values ~= nil then
    local v, e = member(option.values, info, inh.handler)
    if e then fail("values", e) elseif type(v) == "table" then valuesTable = v end
  end
  if valuesTable then
    local order = {}
    local sorting = option.sorting and member(option.sorting, info, inh.handler)
    if type(sorting) == "table" then
      for _, k in ipairs(sorting) do if valuesTable[k] ~= nil then order[#order + 1] = k end end
    else
      for k in pairs(valuesTable) do
        local tk = type(k)
        if tk == "string" or tk == "number" or tk == "boolean" then order[#order + 1] = k end
      end
      table.sort(order, sortKeys)
    end
    local list = {}
    for i, k in ipairs(order) do
      local label = valuesTable[k]
      list[i] = { k, labelOf(label, k) }
    end
    out.values = list
  end
  -- current value
  local t = option.type
  if inh.get and t ~= "group" and t ~= "header" and t ~= "description" and t ~= "execute" then
    if t == "multiselect" then
      local value = {}
      for _, pair in ipairs(out.values or {}) do
        local v, e = member(inh.get, info, inh.handler, pair[1])
        if e then fail("get", e) break end
        value[#value + 1] = { pair[1], v and true or false }
      end
      out.value = value
    else
      local v, e, g, b, a = member(inh.get, info, inh.handler)
      if e then fail("get", e)
      elseif t == "color" then out.value = { tonumber(v) or 1, tonumber(g) or 1, tonumber(b) or 1, tonumber(a) or 1 }
      elseif type(v) ~= "function" and type(v) ~= "table" then out.value = v end
    end
  end
  if t == "execute" then out.canRun = type(inh.func) == "function" or type(inh.func) == "string"
  elseif t ~= "group" and t ~= "header" and t ~= "description" then out.canSet = inh.set ~= nil end
  out.errors = errors
  if t == "group" and type(option.args) == "table" and depth < 30 then
    local children = {}
    for k, child in pairs(option.args) do
      if type(child) == "table" then
        local ks, is = { unpack(keys) }, { unpack(ids) }
        ks[#ks + 1] = k
        is[#is + 1] = normKey(k)
        children[#children + 1] = evalNode(root, child, ks, is, inh, depth + 1)
      end
    end
    table.sort(children, function(a, b)
      if a.order ~= b.order then return a.order < b.order end
      return a.key < b.key
    end)
    out.args = children
  end
  return out
end

-- The tab's evaluated tree, or { error = ... }.
function O.tree(tabKey)
  local root, err = buildRoot(tabKey)
  if not root then return { error = shortError(err) } end
  local t0 = os.clock()
  local ok, tree = pcall(evalNode, root, root, {}, {}, {}, 0)
  if not ok then return { error = shortError(tree) } end
  tree.errors = nil -- the root's own name and description are not shown
  tree.ms = math.floor((os.clock() - t0) * 1000)
  return { tree = tree }
end

-- Which tabs the options window shows for the edited aura (a "group only" tab only for groups).
function O.tabList()
  local data = currentData()
  local out = {}
  for _, tab in ipairs(O.tabOrder or {}) do
    local t = O.tabs[tab]
    if not t.groupOnly or (data and data.controlledChildren) then
      out[#out + 1] = { key = tab, label = WeakAuras.L and rawget(WeakAuras.L, t.label) or t.label }
    end
  end
  return out
end

---------------------------------------------------------------------------------------------------
-- Edits
---------------------------------------------------------------------------------------------------
-- Finds the option at ids (normalised keys) in a fresh build of the tab. Returns node, keys, inherited.
local function resolve(root, ids)
  local node, keys, inh = root, {}, {}
  for _, f in ipairs(inheritFields) do inh[f] = root[f] end
  for _, id in ipairs(ids) do
    local found
    if type(node.args) == "table" then
      if node.args[id] ~= nil then
        found = id
      else
        for k in pairs(node.args) do
          if normKey(k) == id then found = k break end
        end
      end
    end
    if found == nil then return nil end
    node = node.args[found]
    keys[#keys + 1] = found
    for _, f in ipairs(inheritFields) do if node[f] ~= nil then inh[f] = node[f] end end
  end
  return node, keys, inh
end

local function equal(a, b)
  if a == b then return true end
  if type(a) ~= "table" or type(b) ~= "table" then return false end
  for k, v in pairs(a) do if not equal(v, b[k]) then return false end end
  for k in pairs(b) do if a[k] == nil then return false end end
  return true
end

local function seqLength(t)
  local n = 0
  for _ in ipairs(t) do n = n + 1 end
  return n
end

-- Applies what changed from 'before' to 'after' onto 'target' (the document as the page holds it),
-- so a document keeps only what its author wrote plus the edits. Sequences that change length are
-- replaced whole (adding or removing a trigger, condition or sub element).
local function applyDiff(target, before, after)
  for k, av in pairs(after) do
    local bv = before[k]
    if not equal(av, bv) then
      if type(av) == "table" and type(bv) == "table" and seqLength(av) == seqLength(bv) then
        if type(target[k]) ~= "table" then target[k] = {} end
        applyDiff(target[k], bv, av)
      else
        target[k] = deepcopy(av)
      end
    end
  end
  for k in pairs(before) do
    if after[k] == nil then target[k] = nil end
  end
end

-- Runs one edit: set(info, value) for a field (colour: r, g, b, a; multiselect: key, checked),
-- func(info) for an execute option. Returns { ok, changed, aura (JSON), warning } or { ok = false, error }.
function O.edit(tabKey, ids, value)
  local data = currentData()
  if not data then return { ok = false, error = "No aura is loaded in the editor" } end
  local root, err = buildRoot(tabKey)
  if not root then return { ok = false, error = shortError(err) } end
  local node, keys, inh = resolve(root, ids)
  if not node then return { ok = false, error = "This option no longer exists: " .. table.concat(ids, " / ") } end
  local info = makeInfo(root, keys, node, inh)
  local before = deepcopy(data)
  local kind = node.type == "execute" and "run" or "set"
  local args, n = { value }, 1
  if (node.type == "color" or node.type == "multiselect") and type(value) == "table" then
    args, n = value, node.type == "color" and 4 or 2
  end

  local fn
  if kind == "run" then fn = inh.func else fn = inh.set end
  if type(fn) == "string" and inh.handler and type(inh.handler[fn]) == "function" then
    local method = inh.handler[fn]
    fn = function(...) return method(inh.handler, ...) end
  end
  if type(fn) ~= "function" then
    return { ok = false, error = kind == "run" and "This button does nothing here" or "This option can't be changed" }
  end
  if kind == "set" and inh.validate ~= nil then
    local v, e = member(inh.validate, info, inh.handler, unpack(args, 1, n))
    if e then return { ok = false, error = shortError(e) } end
    if v ~= true and v ~= nil then
      return { ok = false, error = type(v) == "string" and v or "The addon rejected this value" }
    end
  end
  local r = B.try(fn, info, unpack(args, 1, n))
  local after = currentData()
  if not after then
    -- The edit replaced the data table (e.g. a rename): take whatever the addon registered under the uid.
    return { ok = false, error = r.error and shortError(r.error) or "The aura disappeared after this edit" }
  end
  local changed = not equal(before, after)
  if not r.ok and not changed then return { ok = false, error = shortError(r.error) } end
  local result
  if session.input.internalVersion ~= nil and session.input.internalVersion ~= WeakAuras.InternalVersion() then
    -- Migrated on load: the document as written no longer matches the addon's shape.
    result = deepcopy(after)
  else
    result = deepcopy(session.input)
    applyDiff(result, before, after)
  end
  if changed then
    session.input = deepcopy(result)
  end
  return { ok = true, changed = changed, aura = AuraCore.toJSON(result),
    warning = not r.ok and shortError(r.error) or nil }
end

function O.setupErrors() return setupErrors end
`;
