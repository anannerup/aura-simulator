/**
 * Lua source the core runs around the addon's own files. Kept as strings so the core works in the
 * browser and in Node without loading files.
 */

/** WoW globals the vendored libraries expect before they load. */
export const WOW_SHIM = `
strmatch = string.match
strsub = string.sub
strbyte = string.byte
strchar = string.char
strfind = string.find
strlen = string.len
strlower = string.lower
strupper = string.upper
strrep = string.rep
format = string.format
gsub = string.gsub
tinsert = table.insert
tremove = table.remove
tconcat = table.concat
wipe = function(t) for k in pairs(t) do t[k] = nil end return t end
time = os.time

-- Lua 5.1 has no bit library; WoW ships one. Only what the loaded files use.
do
  local floor = math.floor
  local function tou32(x) return x % 4294967296 end
  local function bitop(a, b, f)
    a, b = tou32(a), tou32(b)
    local r, m = 0, 1
    for _ = 1, 32 do
      local x, y = a % 2, b % 2
      if f(x, y) then r = r + m end
      a, b, m = floor(a / 2), floor(b / 2), m * 2
    end
    return r
  end
  bit = {
    band = function(a, b) return bitop(a, b, function(x, y) return x == 1 and y == 1 end) end,
    bor = function(a, b) return bitop(a, b, function(x, y) return x == 1 or y == 1 end) end,
    bxor = function(a, b) return bitop(a, b, function(x, y) return x ~= y end) end,
    lshift = function(a, n) return tou32(tou32(a) * 2 ^ n) end,
    rshift = function(a, n) return floor(tou32(a) / 2 ^ n) end,
  }
end
`;

/**
 * Loads one addon file by source text (global __src) and chunk name (global __name).
 * Plain libraries run in the global environment.
 */
export const LOAD_LIBRARY = `
local fn, err = loadstring(__src, "@" .. __name)
if not fn then error(err, 0) end
fn(__name)
__src = nil
`;

/**
 * Loads WeakAuras/Transmission.lua in a sandbox so the addon's own StringToTable is available.
 * Unknown globals (frames, chat hooks, comm libraries) resolve to a permissive stub; the stub is
 * never reached by the decode path, which only needs LibDeflate, LibSerialize and string/math.
 */
export const LOAD_TRANSMISSION = `
local function stub()
  local s = {}
  return setmetatable(s, {
    __index = function() return stub() end,
    __call = function() return stub() end,
  })
end

local function getLib(_, name)
  return LibStub:GetLibrary(name, true) or stub()
end

AuraCorePrivate = {}
local sandbox = {
  WeakAuras = {
    IsLibsOK = function() return true end,
    L = setmetatable({}, { __index = function(_, k) return k end }),
    versionString = __versionString,
  },
  LibStub = setmetatable({ GetLibrary = getLib }, { __call = getLib }),
}
setmetatable(sandbox, {
  __index = function(_, k)
    local v = _G[k]
    if v ~= nil then return v end
    return stub()
  end,
})

local fn, err = loadstring(__src, "@" .. __name)
if not fn then error(err, 0) end
setfenv(fn, sandbox)
fn("WeakAuras", AuraCorePrivate)
__src = nil
if type(AuraCorePrivate.StringToTable) ~= "function" then
  error("Transmission.lua did not define Private.StringToTable", 0)
end
`;

/** Encode/decode entry points plus a Lua table -> JSON writer that follows src/core/lua-value.ts. */
export const AURA_CORE = `
AuraCore = {}
local LibDeflate = LibStub("LibDeflate")
local LibSerialize = LibStub("LibSerialize")

-- Mirrors Transmission.lua TableToString(transmit, forChat = true, encrypt = false):
-- configForLS and configForDeflate are copied from there.
function AuraCore.encode(transmit)
  local serialized = LibSerialize:SerializeEx({ errorOnUnserializableType = false }, transmit)
  local compressed = LibDeflate:CompressDeflate(serialized, { level = 9 })
  return "!WA:2!" .. LibDeflate:EncodeForPrint(compressed)
end

local function numberString(x)
  if x ~= x or x == math.huge or x == -math.huge then
    error("cannot represent non-finite number " .. tostring(x), 0)
  end
  if x == math.floor(x) and math.abs(x) < 2 ^ 53 then
    return string.format("%.0f", x)
  end
  for precision = 14, 17 do
    local s = string.format("%." .. precision .. "g", x)
    if tonumber(s) == x then return s end
  end
  return string.format("%.17g", x)
end

local function jsonString(s)
  return '"' .. s:gsub('[%c"\\\\]', function(c)
    if c == '"' then return '\\\\"' end
    if c == "\\\\" then return "\\\\\\\\" end
    return string.format("\\\\u%04x", c:byte())
  end) .. '"'
end

local function keyString(k)
  local t = type(k)
  if t == "string" then
    if k:sub(1, 1) == "[" then return "[" .. jsonString(k) .. "]" end
    return k
  elseif t == "number" then
    return "[" .. numberString(k) .. "]"
  elseif t == "boolean" then
    return "[" .. tostring(k) .. "]"
  end
  error("cannot represent a table key of type " .. t, 0)
end

local toJSON
function toJSON(v, out)
  local t = type(v)
  if t == "string" then
    out[#out + 1] = jsonString(v)
  elseif t == "number" then
    out[#out + 1] = numberString(v)
  elseif t == "boolean" then
    out[#out + 1] = tostring(v)
  elseif t == "table" then
    local n = 0
    for _ in pairs(v) do n = n + 1 end
    local isSequence = n > 0
    for i = 1, n do
      if v[i] == nil then isSequence = false break end
    end
    if isSequence then
      out[#out + 1] = "["
      for i = 1, n do
        if i > 1 then out[#out + 1] = "," end
        toJSON(v[i], out)
      end
      out[#out + 1] = "]"
    else
      local keys = {}
      for k in pairs(v) do keys[#keys + 1] = keyString(k) end
      local byString = {}
      for k in pairs(v) do byString[keyString(k)] = k end
      table.sort(keys)
      out[#out + 1] = "{"
      for i, ks in ipairs(keys) do
        if i > 1 then out[#out + 1] = "," end
        out[#out + 1] = jsonString(ks)
        out[#out + 1] = ":"
        toJSON(v[byString[ks]], out)
      end
      out[#out + 1] = "}"
    end
  else
    error("cannot represent a value of type " .. t, 0)
  end
end

function AuraCore.toJSON(v)
  local out = {}
  toJSON(v, out)
  return table.concat(out)
end

-- Decodes with the addon's own StringToTable (fromChat = true, as WeakAuras.Import does).
-- Returns "J" .. JSON of the received table, or "E" .. error message.
function AuraCore.decode(code)
  local ok, received = pcall(AuraCorePrivate.StringToTable, code, true)
  if not ok then return "E" .. tostring(received) end
  if type(received) == "string" then return "E" .. received end
  if type(received) ~= "table" then return "E" .. "Not an import string" end
  local ok2, json = pcall(AuraCore.toJSON, received)
  if not ok2 then return "E" .. tostring(json) end
  return "J" .. json
end
`;
