import { beforeAll, describe, expect, test } from "vitest";
import { Lua } from "wasmoon-lua5.1";
import {
  LuaLiteralError,
  loadAddon,
  parseCanonicalJson,
  parseLuaLiteral,
  printCanonicalJson,
  printLuaLiteral,
  sampleIconAura,
  type AuraCore,
  type AuraDocument,
  type LuaValue,
} from "@/core";
import { AURA_CORE } from "./lua-glue";
import { cachedAddonFetcher } from "../../tests/support/addon-source";

const REF = "v1.15.0";
const fetchSource = cachedAddonFetcher(REF);
let core: AuraCore;
let tutorialAuras: AuraDocument[];
/** Evaluates a literal in the real Lua 5.1 and returns it in the document form (the core's own Lua -> JSON writer). */
let realLua: (text: string) => LuaValue;

beforeAll(async () => {
  core = await loadAddon(REF, { fetchSource });
  const src = await fetchSource("WeakAuras/ForeverTutorial.lua");
  const codes = [...src.matchAll(/import = "(!WA:2![^"]+)"/g)].map((m) => m[1]);
  tutorialAuras = codes.flatMap((c) => {
    const d = core.decode(c);
    return [d.aura, ...d.children];
  });

  const lua = await Lua.create();
  lua.doStringSync('LibStub = function() return {} end');
  lua.doStringSync(AURA_CORE);
  realLua = (text) => {
    lua.global.set("__text", text);
    const json: unknown = lua.doStringSync(
      'local f = assert(loadstring("return " .. __text)); setfenv(f, {}); return AuraCore.toJSON(f())',
    );
    return JSON.parse(json as string) as LuaValue;
  };
});

const tricky: AuraDocument = {
  id: 'Ætherisk ✓ "quoted" \\ back\nslash\ttab\r\u0001\u007f',
  "1": "string key one",
  "[1]": "number key one",
  "[2.5]": "float key",
  "[-3]": "negative key",
  "[true]": "boolean key",
  "[false]": false,
  '["[odd"]': "string key starting with a bracket",
  end: "reserved word key",
  "with space": "",
  _ok9: 0,
  sparse: { "[1]": "a", "[3]": "c" },
  mixed: { "[1]": { x: 1 }, disjunctive: "any" },
  numbers: [0, 1, -1, 0.1, 2 ** 53 - 1, -(2 ** 40), 123456789.125, -0.000001, 1.25e-300, 1.5e-7],
  nested: [{}, {}, [[1, 2], { a: [true, false] }]],
  long: "x".repeat(200),
};

describe("Lua literal printer and parser", () => {
  test("round trip losslessly: number vs string keys, sparse and mixed tables, escapes", () => {
    const text = printLuaLiteral(tricky);
    expect(parseLuaLiteral(text)).toStrictEqual(tricky);
    expect(text).toContain('["1"] = "string key one"');
    expect(text).toContain('[1] = "number key one"');
    expect(text).toContain('["end"] = ');
    expect(text).toContain("_ok9 = 0");
    expect(text).toContain("Ætherisk ✓");
  });

  test("the real Lua reads printed text the same way", () => {
    expect(realLua(printLuaLiteral(tricky))).toStrictEqual(tricky);
  });

  test("the sample and the addon's tutorial auras round trip, also through the real Lua and a state code", () => {
    const auras = [sampleIconAura(core.internalVersion), ...tutorialAuras];
    expect(auras.length).toBeGreaterThan(3);
    for (const aura of auras) {
      const text = printLuaLiteral(aura);
      const parsed = parseLuaLiteral(text);
      expect(parsed).toStrictEqual(aura);
      expect(realLua(text)).toStrictEqual(aura);
      expect(core.decode(core.encode({ aura: parsed as AuraDocument, children: [] })).aura).toStrictEqual(aura);
      expect(parseCanonicalJson(printCanonicalJson(aura))).toStrictEqual(aura);
    }
  });

  test("reads hand-written Lua like the real Lua does", () => {
    const samples = [
      `{ "a", "b", [5] = "e", n = nil, 'single \\'q\\'', }`,
      `{ [[long
string]], [==[with ]] inside]==], -- a comment
        --[[ a block
        comment ]] x = 0x1F; y = -.5, z = 1e3, w = 3., v = "\\65\\066\\0671", u = "a\\
b", t = "\\226\\156\\147" }`,
      `{ [1] = "one", [2] = "two" }`,
      `{ [1] = "one", [3] = "three" }`,
      `{ nil, "second" }`,
      `{ {}, { {} } }`,
      `{ ["1"] = 1, [1.0] = 2, [true] = 3 }`,
    ];
    for (const s of samples) expect(parseLuaLiteral(s)).toStrictEqual(realLua(s));
    expect(parseLuaLiteral("return { a = 1 }")).toStrictEqual({ a: 1 });
  });

  test("invalid text fails with a line and column", () => {
    const fail = (text: string) => {
      try {
        parseLuaLiteral(text);
      } catch (e) {
        expect(e).toBeInstanceOf(LuaLiteralError);
        const err = e as LuaLiteralError;
        return [err.line, err.column, err.reason];
      }
      throw new Error(`parsed: ${text}`);
    };
    expect(fail('{\n  a = 1,\n  b = 2\n  c = 3,\n}')).toEqual([4, 3, "'}' or ',' expected near 'c'"]);
    expect(fail('{\n  a = "open\n}')).toEqual([2, 7, "unfinished string"]);
    expect(fail("{ a = 1, a = 2 }")).toEqual([1, 10, "key a is given twice"]);
    expect(fail("{ [1] = 1, 2 }")[2]).toBe("key [1] is given twice");
    expect(fail("{ a = foo }")[2]).toMatch(/only literal values/);
    expect(fail("{ a = 12abc }")[2]).toMatch(/malformed number/);
    expect(fail("{ a = 9007199254740993 }")[2]).toMatch(/2\^53/);
    expect(fail("{ a = 1 } x")[2]).toMatch(/after the table/);
    expect(fail("{ a = 1")[2]).toMatch(/expected near the end of the text/);
    expect(fail("{ [nil] = 1 }")[2]).toMatch(/can't be nil/);
  });

  test("canonical JSON errors carry a position", () => {
    expect(() => parseCanonicalJson('{\n  "a": 1,\n  "b" 2\n}')).toThrow(LuaLiteralError);
    expect(parseCanonicalJson('{ "[1]": "x", "[2]": "y" }')).toStrictEqual(["x", "y"]);
  });
});
