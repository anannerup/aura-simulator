/**
 * Extracts the option tables of every region type (WeakAuras/RegionTypes/*.lua) and sub-region type
 * (WeakAuras/SubRegionTypes/*.lua) by running each file in a Lua sandbox and capturing what it passes to
 * Private.RegisterRegionType / WeakAuras.RegisterSubRegionType: the `default` table (option names and
 * default values) and the `properties` table (the options conditions can change).
 *
 * The sandbox stubs the WoW API with a value that absorbs every index, call and arithmetic, so the files
 * run without the game. Values that came from the stub show up as "<dynamic>", functions as "<function>".
 * A file that still fails is reported in `failures` rather than failing the whole extraction.
 */
import path from "node:path";
import { Lua } from "wasmoon-lua5.1";

export interface OptionTable {
  /** Repo-relative Lua file that registered the type. */
  file: string;
  /** Default option values (top level of the `default` table), or null if none was registered. */
  defaults: Record<string, unknown> | null;
  /** Names of the `properties` entries, sorted, or null if none could be read. */
  properties: string[] | null;
}

export interface OptionTables {
  regionTypes: Record<string, OptionTable>;
  subRegionTypes: Record<string, OptionTable>;
  failures: { file: string; error: string }[];
}

export const isRegionFile = (p: string) => /^WeakAuras\/(Sub)?RegionTypes\/[^/]+\.lua$/.test(p);

/** Parent region type passed to sub-region defaults that are functions of it (most use "icon"-style defaults). */
const SUB_REGION_PARENT = "icon";

const SANDBOX = `
local MAGIC_MT = {}
local function magic() return setmetatable({}, MAGIC_MT) end
local function absorb() return magic() end
MAGIC_MT.__index = absorb
MAGIC_MT.__call = absorb
MAGIC_MT.__add = absorb
MAGIC_MT.__sub = absorb
MAGIC_MT.__mul = absorb
MAGIC_MT.__div = absorb
MAGIC_MT.__mod = absorb
MAGIC_MT.__pow = absorb
MAGIC_MT.__unm = absorb
MAGIC_MT.__concat = absorb
MAGIC_MT.__len = function() return 0 end
MAGIC_MT.__lt = function() return false end
MAGIC_MT.__le = function() return false end

local function isMagic(v) return type(v) == "table" and getmetatable(v) == MAGIC_MT end

local function absorbing(t)
  return setmetatable(t, { __index = function(self, k) local m = magic(); rawset(self, k, m); return m end })
end

local captured

local function makeEnv()
  local WeakAuras = absorbing({
    IsLibsOK = function() return true end,
    L = setmetatable({}, { __index = function(_, k) return k end }),
    RegisterSubRegionType = function(name, displayName, supports, create, modify, onAcquire, onRelease, default, addDefaults, properties)
      captured.sub[#captured.sub + 1] = { name = name, default = default, properties = properties }
    end,
    RegisterRegionType = function(name, create, modify, default, properties)
      captured.region[#captured.region + 1] = { name = name, default = default, properties = properties }
    end,
  })
  local Private = absorbing({
    RegisterRegionType = WeakAuras.RegisterRegionType,
    RegisterSubRegionType = WeakAuras.RegisterSubRegionType,
  })
  local function copyTable(t)
    if type(t) ~= "table" or isMagic(t) then return t end
    local c = {}
    for k, v in pairs(t) do c[k] = copyTable(v) end
    -- GetProperties functions index entries the region prototype would have added; let them absorb.
    return absorbing(c)
  end
  local env = {
    WeakAuras = WeakAuras,
    CopyTable = copyTable,
    tinsert = table.insert,
    tremove = table.remove,
    wipe = function(t) for k in pairs(t) do t[k] = nil end return t end,
    GetScreenWidth = function() return 1920 end,
    GetScreenHeight = function() return 1080 end,
  }
  setmetatable(env, {
    __index = function(_, k)
      local v = _G[k]
      if v ~= nil and k ~= "__src" and k ~= "__name" then return v end
      return magic()
    end,
  })
  return env, Private
end

local function num(x)
  if x ~= x or x == math.huge or x == -math.huge then return '"' .. tostring(x) .. '"' end
  if x == math.floor(x) and math.abs(x) < 1e15 then return string.format("%d", x) end
  return string.format("%.17g", x)
end

local function str(s)
  return '"' .. s:gsub('[%c"\\\\]', function(c)
    if c == '"' then return '\\\\"' elseif c == "\\\\" then return "\\\\\\\\" end
    return string.format("\\\\u%04x", c:byte())
  end) .. '"'
end

local toJSON
function toJSON(v, depth)
  local t = type(v)
  if v == nil then return "null"
  elseif t == "boolean" then return tostring(v)
  elseif t == "number" then return num(v)
  elseif t == "string" then return str(v)
  elseif t == "function" then return '"<function>"'
  elseif isMagic(v) then return '"<dynamic>"'
  elseif t ~= "table" then return '"<' .. t .. '>"'
  end
  if depth > 8 then return '"<deep>"' end
  local n = 0
  for _ in pairs(v) do n = n + 1 end
  if n > 0 and n == #v then
    local out = {}
    for i = 1, n do out[i] = toJSON(v[i], depth + 1) end
    return "[" .. table.concat(out, ",") .. "]"
  end
  local entries = {}
  for k, x in pairs(v) do
    local ks
    if type(k) == "string" then ks = k
    elseif type(k) == "number" or type(k) == "boolean" then ks = "[" .. tostring(k) .. "]"
    end
    if ks then entries[#entries + 1] = { ks, x } end
  end
  table.sort(entries, function(a, b) return a[1] < b[1] end)
  local out = {}
  for i, e in ipairs(entries) do out[i] = str(e[1]) .. ":" .. toJSON(e[2], depth + 1) end
  return "{" .. table.concat(out, ",") .. "}"
end

local function keysOf(t)
  if type(t) ~= "table" or isMagic(t) then return nil end
  local out = {}
  for k, v in pairs(t) do if type(k) == "string" and not isMagic(v) then out[#out + 1] = k end end
  table.sort(out)
  return out
end

local function copy(t)
  if type(t) ~= "table" then return t end
  local c = {}
  for k, v in pairs(t) do c[k] = v end
  return c
end

local function describe(entry, defaultArg)
  local default = entry.default
  if type(default) == "function" then
    local ok, d = pcall(default, defaultArg)
    default = ok and d or nil
  end
  if isMagic(default) then default = nil end
  local properties = entry.properties
  if type(properties) == "function" then
    local ok, p = pcall(properties, copy(default) or {})
    properties = ok and p or nil
  end
  local names = keysOf(properties)
  return '{"name":' .. str(tostring(entry.name)) .. ',"defaults":' .. (type(default) == "table" and toJSON(default, 0) or "null")
    .. ',"properties":' .. (names and ("[" .. table.concat((function()
      local q = {}
      for i, s in ipairs(names) do q[i] = str(s) end
      return q
    end)(), ",") .. "]") or "null") .. "}"
end

function ExtractOptionTables(src, name)
  captured = { region = {}, sub = {} }
  local fn, err = loadstring(src, "@" .. name)
  if not fn then return '{"error":' .. str(tostring(err)) .. '}' end
  local env, Private = makeEnv()
  setfenv(fn, env)
  debug.sethook(function() error("took too long", 0) end, "", 5000000)
  local ok, runErr = pcall(fn, "WeakAuras", Private)
  debug.sethook()
  local parts = {}
  for _, e in ipairs(captured.region) do
    local ok2, s = pcall(describe, e, nil)
    if ok2 then parts[#parts + 1] = '{"kind":"region","entry":' .. s .. '}' end
  end
  for _, e in ipairs(captured.sub) do
    local ok2, s = pcall(describe, e, "${SUB_REGION_PARENT}")
    if ok2 then parts[#parts + 1] = '{"kind":"sub","entry":' .. s .. '}' end
  end
  local errJSON = ok and "null" or str(tostring(runErr))
  return '{"error":' .. errJSON .. ',"found":[' .. table.concat(parts, ",") .. ']}'
end
`;

interface Extracted {
  error: string | null;
  found?: { kind: "region" | "sub"; entry: { name: string; defaults: Record<string, unknown> | null; properties: string[] | null } }[];
}

export function defaultWasmUri(): string {
  return path.join(process.cwd(), "node_modules/wasmoon-lua5.1/dist/liblua5.1.wasm");
}

/** Runs the given region/sub-region type files and collects their option tables. */
export async function extractOptionTables(
  files: { path: string; text: string }[],
  options: { wasmUri?: string } = {},
): Promise<OptionTables> {
  const lua = await Lua.create({ customWasmUri: options.wasmUri ?? defaultWasmUri() });
  const result: OptionTables = { regionTypes: {}, subRegionTypes: {}, failures: [] };
  try {
    lua.doStringSync(SANDBOX);
    for (const file of files) {
      lua.global.set("__src", file.text.replace(/\r\n?/g, "\n"));
      lua.global.set("__name", file.path);
      const json = lua.doStringSync("return ExtractOptionTables(__src, __name)") as string;
      const extracted = JSON.parse(json) as Extracted;
      const found = extracted.found ?? [];
      for (const { kind, entry } of found) {
        const table: OptionTable = { file: file.path, defaults: entry.defaults, properties: entry.properties };
        (kind === "region" ? result.regionTypes : result.subRegionTypes)[entry.name] = table;
      }
      // A file that registered its type before failing still counts; one that registered nothing is a failure.
      if (extracted.error && found.length === 0) result.failures.push({ file: file.path, error: extracted.error });
    }
  } finally {
    lua.global.close();
  }
  return result;
}
