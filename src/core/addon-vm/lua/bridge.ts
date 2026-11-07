/**
 * JS <-> Lua helpers inside the addon VM: run one file,
 * fire events, drive the frame loop, JSON-encode arbitrary Lua values, evaluate AceConfig option tables.
 */
export const BRIDGE_LUA = String.raw`-- JS <-> Lua bridge helpers: run one addon file, JSON-encode Lua values (handles functions,
-- stubs, frames and cycles), and evaluate AceConfig option tables into plain data.

__bridge = {}
local B = __bridge
local S = __shim
S.private = S.private or {}

-- Runs one addon file. The loader puts its source in the global __src first.
function S.runFile(addon, relPath)
  S.currentFile = addon .. "/" .. relPath
  local f, err = loadstring(__src, "@" .. addon .. "/" .. relPath)
  __src = nil
  if not f then
    return { status = "compile-error", error = tostring(err) }
  end
  local ok, e = xpcall(function() return f(addon, S.private[addon]) end, debug.traceback)
  S.currentFile = "?"
  if not ok then
    return { status = "runtime-error", error = tostring(e) }
  end
  return { status = "ok" }
end

-- Fire an event to every registered mock frame, each handler protected.
function S.fireSafe(event, ...)
  if event == "PLAYER_LOGIN" then S.loggedIn = true end
  local args, n = { ... }, select("#", ...)
  local res = { handlers = 0, errors = {} }
  for f in pairs(S.eventFrames[event] or {}) do
    local h = rawget(f, "__scripts").OnEvent
    if h then
      res.handlers = res.handlers + 1
      S.currentFile = "event:" .. event
      local ok, err = xpcall(function() return h(f, event, unpack(args, 1, n)) end, debug.traceback)
      if not ok then table.insert(res.errors, tostring(err)) end
    end
  end
  S.currentFile = "?"
  return res
end

-- Drive the frame loop: advance GetTime(), run every OnUpdate script and due C_Timer callbacks.
-- Used to let the addon's coroutine scheduler (Private.Threads: login, AddMany) finish.
function S.tick(times, elapsed)
  elapsed = elapsed or 0.05
  local res = { ticks = 0, errors = {} }
  for _ = 1, times or 1 do
    S.now = (S.now or 1000) + elapsed
    res.ticks = res.ticks + 1
    for _, f in ipairs(S.frames) do
      local h = rawget(f, "__shown") and rawget(f, "__scripts").OnUpdate
      if h then
        S.currentFile = "OnUpdate"
        local ok, err = xpcall(function() return h(f, elapsed) end, debug.traceback)
        if not ok and #res.errors < 20 then table.insert(res.errors, tostring(err)) end
      end
    end
    local due = {}
    for i = #S.timers, 1, -1 do
      local tm = S.timers[i]
      tm.left = (tm.left or tm.delay or 0) - elapsed
      if tm.cancelled then table.remove(S.timers, i)
      elseif tm.left <= 0 then
        due[#due + 1] = tm
        tm.iterations = (tm.iterations or 1) - 1
        if tm.iterations <= 0 then table.remove(S.timers, i) else tm.left = tm.delay end
      end
    end
    for _, tm in ipairs(due) do
      S.currentFile = "C_Timer"
      local ok, err = xpcall(function() return tm.cb(tm) end, debug.traceback)
      if not ok and #res.errors < 20 then table.insert(res.errors, tostring(err)) end
    end
  end
  S.currentFile = "?"
  return res
end

-- Call fn in protected mode, return { ok = true, value = ... } or { ok = false, error = ... }.
function B.try(fn, ...)
  local args, n = { ... }, select("#", ...)
  local res = { xpcall(function() return fn(unpack(args, 1, n)) end, debug.traceback) }
  if res[1] then return { ok = true, value = res[2], value2 = res[3] } end
  return { ok = false, error = tostring(res[2]) }
end

-- try() result -> value (nil/false become false: "no problem") or { error = ... }
function B.result(r)
  if not r.ok then return { error = r.error } end
  if r.value == nil then return false end
  return r.value
end

---------------------------------------------------------------------------------------------------
-- JSON
---------------------------------------------------------------------------------------------------
local escapes = { ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
local function escapeStr(s)
  return '"' .. s:gsub('[%c"\\]', function(c) return escapes[c] or string.format("\\u%04x", c:byte()) end) .. '"'
end

local function isArray(t)
  local n = 0
  for k in pairs(t) do
    if type(k) ~= "number" or k < 1 or k % 1 ~= 0 then return false end
    n = n + 1
  end
  for i = 1, n do if t[i] == nil then return false end end
  return true, n
end

-- Marks an aura (or a list of auras) to be written in the document form (AuraCore.toJSON, lua-value.ts)
-- inside a B.json answer, so the page gets it already parsed.
local docMT = {}
function B.doc(v) return setmetatable({ v }, docMT) end

-- JSON for answers to the page: sequences and empty tables become arrays, other tables objects
-- (keys as strings), B.doc values aura documents. opts.functions: "omit" (default) or "mark" ("<function>")
function B.json(v, opts)
  opts = opts or {}
  local seen = {}
  local buf = {}
  local function enc(x, depth)
    local tx = type(x)
    if tx == "nil" then buf[#buf + 1] = "null"
    elseif tx == "boolean" then buf[#buf + 1] = tostring(x)
    elseif tx == "number" then
      if x ~= x or x == math.huge or x == -math.huge then buf[#buf + 1] = "null"
      elseif x % 1 == 0 and math.abs(x) < 1e15 then buf[#buf + 1] = string.format("%d", x)
      else buf[#buf + 1] = string.format("%.14g", x) end
    elseif tx == "string" then buf[#buf + 1] = escapeStr(x)
    elseif tx == "function" then buf[#buf + 1] = '"<function>"'
    elseif tx == "table" then
      if getmetatable(x) == docMT then buf[#buf + 1] = AuraCore.toJSON(x[1]) return end
      if S.isStub(x) then buf[#buf + 1] = escapeStr("<stub:" .. tostring(x) .. ">") return end
      if rawget(x, "__kind") then buf[#buf + 1] = '"<frame>"' return end
      if seen[x] or depth > (opts.maxDepth or 40) then buf[#buf + 1] = '"<cycle>"' return end
      seen[x] = true
      local arr, n = isArray(x)
      if arr then
        buf[#buf + 1] = "["
        for i = 1, n do
          if i > 1 then buf[#buf + 1] = "," end
          enc(x[i], depth + 1)
        end
        buf[#buf + 1] = "]"
      else
        local keys = {}
        for k, val in pairs(x) do
          local tk = type(k)
          if (tk == "string" or tk == "number" or tk == "boolean")
            and not (type(val) == "function" and opts.functions ~= "mark") then
            keys[#keys + 1] = k
          end
        end
        table.sort(keys, function(a, b)
          if type(a) == type(b) then return a < b end
          return type(a) == "number"
        end)
        buf[#buf + 1] = "{"
        for i, k in ipairs(keys) do
          if i > 1 then buf[#buf + 1] = "," end
          buf[#buf + 1] = escapeStr(tostring(k))
          buf[#buf + 1] = ":"
          enc(x[k], depth + 1)
        end
        buf[#buf + 1] = "}"
      end
      seen[x] = nil
    else
      buf[#buf + 1] = escapeStr("<" .. tx .. ">")
    end
  end
  enc(v, 0)
  return table.concat(buf)
end

---------------------------------------------------------------------------------------------------
-- AceConfig option table -> plain data
---------------------------------------------------------------------------------------------------
-- AceConfig fields can be values, functions (called with an "info" table) or method names resolved
-- through the "handler". We evaluate them the way AceConfigDialog does, for one aura, so a web form
-- can be generated from the result. get() is evaluated too, so each field carries its current value.

local evalFields = { "name", "desc", "hidden", "disabled", "values", "sorting", "min", "max",
  "softMin", "softMax", "step", "bigStep", "width", "multiline", "image", "imageWidth",
  "imageHeight", "isPercent", "hasAlpha", "dialogControl", "confirm", "fontSize", "control", "itemControl" }
local inheritFields = { get = true, set = true, hidden = true, disabled = true, handler = true, func = true, validate = true, confirm = true }

local function evalOne(value, info, handler)
  if type(value) == "function" then
    local ok, r1, r2, r3, r4 = pcall(value, info)
    if not ok then return { __error = tostring(r1) } end
    return r1, r2, r3, r4
  elseif type(value) == "string" and handler and type(handler[value]) == "function" then
    -- method name on the handler (only for fields that are documented to accept one)
    return value
  end
  return value
end

local function infoFor(rootOptions, path, option, inherited)
  local info = { options = rootOptions, option = option, arg = option.arg, handler = inherited.handler,
    type = option.type, uiType = "dialog", uiName = "WeakAuras", appName = "WeakAuras" }
  for i, p in ipairs(path) do info[i] = p end
  return info
end

-- Returns a JSON-friendly tree. stats counts evaluation errors per field.
function B.evalOptions(root, stats, maxDepth)
  stats = stats or { nodes = 0, errors = 0, errorSamples = {} }
  local function walk(option, path, inherited, depth)
    stats.nodes = stats.nodes + 1
    local inh = {}
    for k in pairs(inheritFields) do inh[k] = option[k] ~= nil and option[k] or inherited[k] end
    local info = infoFor(root, path, option, inh)
    local out = { key = path[#path], type = option.type, order = option.order }
    for _, f in ipairs(evalFields) do
      local v = option[f]
      if v == nil and (f == "hidden" or f == "disabled") then v = inh[f] end
      if v ~= nil and not (#path == 0 and (f == "hidden" or f == "disabled")) then -- root values only feed inheritance
        local r = evalOne(v, info, inh.handler)
        if type(r) == "table" and r.__error then
          stats.errors = stats.errors + 1
          if #stats.errorSamples < 30 then
            table.insert(stats.errorSamples, table.concat(path, ".") .. "." .. f .. ": " .. r.__error:sub(1, 200))
          end
          out[f .. "Error"] = r.__error:sub(1, 300)
        else
          out[f] = r
        end
      end
    end
    -- current value
    local get = option.get or inh.get
    if get and option.type ~= "group" and option.type ~= "header" and option.type ~= "description" and option.type ~= "execute" then
      local ok, a, b, c, d = pcall(get, info, option.type == "multiselect" and nil or nil)
      if ok then
        if option.type == "color" then out.value = { a, b, c, d } else out.value = a end
      else
        stats.errors = stats.errors + 1
        out.getError = tostring(a):sub(1, 300)
        if #stats.errorSamples < 30 then table.insert(stats.errorSamples, table.concat(path, ".") .. ".get: " .. tostring(a):sub(1, 200)) end
      end
      -- multiselect: get(info, key) per value
      if option.type == "multiselect" and type(out.values) == "table" then
        out.value = {}
        for k in pairs(out.values) do
          local ok2, v2 = pcall(get, info, k)
          if ok2 then out.value[tostring(k)] = v2 end
        end
      end
    end
    out.hasSet = (option.set or inh.set) ~= nil
    if option.type == "group" and type(option.args) == "table" and depth < (maxDepth or 30) then
      local children = {}
      for k, child in pairs(option.args) do
        if type(child) == "table" then
          local p = { unpack(path) }
          p[#p + 1] = k
          children[#children + 1] = walk(child, p, inh, depth + 1)
        end
      end
      table.sort(children, function(a, b)
        local oa, ob = tonumber(a.order) or 100, tonumber(b.order) or 100
        if oa ~= ob then return oa < ob end
        return tostring(a.key) < tostring(b.key)
      end)
      out.args = children
    end
    -- values may be huge (e.g. sound/texture lists); keep them but trim for the sample
    return out
  end
  return walk(root, {}, {}, 0), stats
end
`;
