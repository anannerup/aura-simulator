/**
 * The Lua 5.1 standard library under WoW's names (string/table/math aliases, degree trig, wipe, time,
 * LuaBitOp's bit). Both Lua VMs run it first: the light one (encode/decode) and the full addon VM.
 */
export const LUA_STDLIB = String.raw`
strmatch, strsub, strbyte, strchar, strfind, strlen, strrep, strlower, strupper, strrev, format, gsub, gmatch =
  string.match, string.sub, string.byte, string.char, string.find, string.len, string.rep,
  string.lower, string.upper, string.reverse, string.format, string.gsub, string.gmatch
tinsert, tremove, sort, getn, tconcat = table.insert, table.remove, table.sort, table.getn, table.concat
floor, ceil, abs, sqrt, max, min, random, mod, fmod, exp, log, log10, frexp, ldexp =
  math.floor, math.ceil, math.abs, math.sqrt, math.max, math.min, math.random, math.fmod, math.fmod,
  math.exp, math.log, math.log10, math.frexp, math.ldexp
PI = math.pi
rad, deg = math.rad, math.deg
-- WoW's trig functions take degrees.
sin = function(d) return math.sin(math.rad(d)) end
cos = function(d) return math.cos(math.rad(d)) end
tan = function(d) return math.tan(math.rad(d)) end
asin = function(x) return math.deg(math.asin(x)) end
acos = function(x) return math.deg(math.acos(x)) end
atan = function(x) return math.deg(math.atan(x)) end
atan2 = function(y, x) return math.deg(math.atan2(y, x)) end

function wipe(t) for k in pairs(t) do t[k] = nil end return t end
table.wipe = wipe
time = os.time
date = os.date

-- bit library (LuaBitOp semantics on 32-bit ints)
do
  local function norm(x) x = math.floor(x) % 4294967296 return x end
  local function tosigned(x) if x >= 2147483648 then return x - 4294967296 end return x end
  local function bitop(a, b, f)
    a, b = norm(a), norm(b)
    local r, p = 0, 1
    for _ = 1, 32 do
      local x, y = a % 2, b % 2
      if f(x, y) then r = r + p end
      a, b, p = (a - x) / 2, (b - y) / 2, p * 2
    end
    return tosigned(r)
  end
  bit = {
    band = function(a, b, ...)
      local r = bitop(a, b, function(x, y) return x == 1 and y == 1 end)
      if ... then return bit.band(r, ...) end
      return r
    end,
    bor = function(a, b, ...)
      local r = bitop(a, b or 0, function(x, y) return x == 1 or y == 1 end)
      if ... then return bit.bor(r, ...) end
      return r
    end,
    bxor = function(a, b) return bitop(a, b, function(x, y) return x ~= y end) end,
    bnot = function(a) return tosigned(4294967295 - norm(a)) end,
    lshift = function(a, n) return tosigned(norm(norm(a) * 2 ^ n)) end,
    rshift = function(a, n) return tosigned(math.floor(norm(a) / 2 ^ n)) end,
    arshift = function(a, n) return math.floor(tosigned(norm(a)) / 2 ^ n) end,
    tobit = function(a) return tosigned(norm(a)) end,
  }
end
bit32 = nil
`;
