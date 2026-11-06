import { Lua } from "wasmoon-lua5.1";
import { ADDON_FILES, type AddonSourceFetcher } from "@/core/addon-source";
import { toLuaLiteral, type LuaValue } from "@/core/lua-value";

/**
 * An independent check of a state code: decodes it with only the addon's LibDeflate and LibSerialize
 * along the plain (unencrypted) path, the way upstream WeakAuras would, and compares the result with
 * an expected table inside Lua.
 */
export async function plainDecoder(fetchSource: AddonSourceFetcher) {
  const lua = await Lua.create();
  lua.doStringSync(
    "strmatch=string.match strsub=string.sub strbyte=string.byte strchar=string.char strfind=string.find " +
      "format=string.format gsub=string.gsub strlen=string.len tinsert=table.insert tremove=table.remove " +
      "wipe=function(t) for k in pairs(t) do t[k]=nil end return t end",
  );
  for (const file of [ADDON_FILES.libStub, ADDON_FILES.libDeflate, ADDON_FILES.libSerialize]) {
    lua.doStringSync((await fetchSource(file)).replace(/\r\n?/g, "\n"));
  }
  lua.doStringSync(`
    function deepEqual(a, b)
      if type(a) ~= type(b) then return false end
      if type(a) ~= "table" then return a == b end
      for k, v in pairs(a) do if not deepEqual(v, b[k]) then return false end end
      for k in pairs(b) do if a[k] == nil then return false end end
      return true
    end
    function plainDecodeEquals(code, expected)
      local LD, LS = LibStub("LibDeflate"), LibStub("LibSerialize")
      if code:sub(1, 6) ~= "!WA:2!" then return "no !WA:2! prefix" end
      local decoded = LD:DecodeForPrint(code:sub(7))
      if not decoded then return "not EncodeForPrint data" end
      local decompressed = LD:DecompressDeflate(decoded)
      if not decompressed then return "does not decompress without decryption" end
      local ok, t = LS:Deserialize(decompressed)
      if not ok then return "does not deserialize" end
      if not deepEqual(t, expected) then return "decoded table differs" end
      return "ok"
    end
  `);
  return (code: string, expected: LuaValue): string => {
    lua.global.set("__code", code);
    return lua.doStringSync(`return plainDecodeEquals(__code, ${toLuaLiteral(expected)})`) as string;
  };
}
