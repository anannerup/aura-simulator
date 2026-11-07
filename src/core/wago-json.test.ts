import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { fromWagoJson, loadAddon, toWagoJson, WagoJsonError, type AuraCore, type LuaObject, type LuaValue } from "@/core";
import { cachedAddonFetcher } from "../../tests/support/addon-source";

const FIXTURES = path.resolve(__dirname, "../../tests/fixtures/wago");
/** https://wago.io/LEPRolmHn: its import string (`api/raw/encoded`) and wago's stored JSON (`lookup/wago/code` → `json`). */
const LEPROLMHN_CODE = readFileSync(path.join(FIXTURES, "LEPRolmHn.txt"), "utf8");
const LEPROLMHN_JSON = readFileSync(path.join(FIXTURES, "LEPRolmHn.json"), "utf8");

describe("wago's own aura (LEPRolmHn)", () => {
  let core: AuraCore;
  beforeAll(async () => {
    core = await loadAddon("v1.15.0", { fetchSource: cachedAddonFetcher("v1.15.0") });
  });

  test("its import string becomes wago's stored JSON, byte for byte", () => {
    expect(toWagoJson(core.decode(LEPROLMHN_CODE), { format: "compact" })).toBe(LEPROLMHN_JSON);
  });

  test("its import string becomes the text of wago's Editor, byte for byte", () => {
    const editorText = JSON.stringify(JSON.parse(LEPROLMHN_JSON), null, 2);
    expect(toWagoJson(core.decode(LEPROLMHN_CODE))).toBe(editorText);
    expect(toWagoJson(core.decode(LEPROLMHN_CODE), { format: "pretty" })).toBe(editorText);
  });

  test("wago's JSON becomes the aura wago rebuilds from it (its import string)", () => {
    const state = fromWagoJson(LEPROLMHN_JSON);
    expect(state).toMatchObject({ senderVersion: "5.21.9", transmissionVersion: 1421 });
    // Our encoder writes its own addon version as the sender, so compare what the string holds of the aura.
    const { aura, children } = core.decode(core.encode(state));
    const wagos = core.decode(LEPROLMHN_CODE);
    expect({ aura, children }).toStrictEqual({ aura: wagos.aura, children: wagos.children });
  });
});

/** wago's compact JSON of one aura (no stamp, sender "5.21.9", transmission 1421). */
function wago(aura: LuaObject, children: LuaObject[] = []): string {
  return toWagoJson({ aura, children, senderVersion: "5.21.9", transmissionVersion: 1421 }, { format: "compact" });
}
/** The compact JSON wago writes for `t` as the aura's field `t`. */
function wagoField(t: LuaValue): string {
  const json = wago({ t });
  return json.slice('{"d":{"t":'.length, -'},"m":"d","s":"5.21.9","v":1421}'.length);
}

describe("aura → wago JSON", () => {
  test("the packet: c (only for a group), d, m, s, v, and wagoID only when the aura carries one", () => {
    expect(wago({ id: "A" })).toBe('{"d":{"id":"A"},"m":"d","s":"5.21.9","v":1421}');
    expect(wago({ id: "G", wagoID: "abc" }, [{ id: "A" }])).toBe(
      '{"c":[{"id":"A"}],"d":{"id":"G","wagoID":"abc"},"m":"d","s":"5.21.9","v":1421,"wagoID":"abc"}',
    );
  });

  test("wago drops the update flags from every aura", () => {
    expect(wago({ id: "G", ignoreWagoUpdate: true }, [{ id: "A", skipWagoUpdate: "1" }])).toBe(
      '{"c":[{"id":"A"}],"d":{"id":"G"},"m":"d","s":"5.21.9","v":1421}',
    );
  });

  test("keys: integer-like ones first in numeric order, the rest by UTF-16 code unit", () => {
    expect(wagoField({ anchor_point: 1, anchorYOffset: 2, Zed: 3, "10": 4, "9": 5, "01": 6, "1.5": 7 })).toBe(
      '{"9":5,"10":4,"01":6,"1.5":7,"Zed":3,"anchorYOffset":2,"anchor_point":1}',
    );
  });

  test("the pretty form is JSON.stringify with 2 spaces: every array item on its own line, no trailing newline", () => {
    const text = toWagoJson({ aura: { color: [1, 0.5], e: {} }, children: [], senderVersion: "x", transmissionVersion: 1 });
    expect(text).toBe(
      '{\n  "d": {\n    "color": [\n      1,\n      0.5\n    ],\n    "e": []\n  },\n  "m": "d",\n  "s": "x",\n  "v": 1\n}',
    );
  });

  test("an empty table is []", () => {
    expect(wagoField({})).toBe("[]");
    expect(wagoField({ a: {}, b: [] })).toBe('{"a":[],"b":[]}');
  });

  test("number keys become strings; a mixed table such as triggers stays an object", () => {
    expect(wagoField({ "[1]": "a", "[2]": "b", disjunctive: "all", activeTriggerMode: -10 })).toBe(
      '{"1":"a","2":"b","activeTriggerMode":-10,"disjunctive":"all"}',
    );
  });

  test("a string key written as an escaped Lua key is the raw string", () => {
    expect(wagoField({ '["[x"]': 1, a: 2 })).toBe('{"[x":1,"a":2}');
  });

  test("a sparse number-keyed table becomes an array padded with null", () => {
    expect(wagoField({ "[1]": true, "[4]": true })).toBe("[true,null,null,true]");
    expect(wagoField({ "[3]": "c" })).toBe('[null,null,"c"]');
  });

  test("a fractional key only sets the array's length (rounded down) and is dropped", () => {
    expect(wagoField({ "[1]": "a", "[2.5]": "f" })).toBe('["a",null]');
    expect(wagoField({ "[0.5]": "x" })).toBe("[]");
  });

  test("a table with 1000 sequence items is an array; with 1001 it is an object", () => {
    const thousand = Array.from({ length: 1000 }, (_, i) => i);
    expect(JSON.parse(wagoField(thousand))).toStrictEqual(thousand);
    const json = JSON.parse(wagoField([...thousand, 1000])) as Record<string, number>;
    expect(Array.isArray(json)).toBe(false);
    expect(Object.keys(json)).toHaveLength(1001);
    expect([json["1"], json["1000"], json["1001"]]).toStrictEqual([0, 999, 1000]);
  });

  test("a key above 1000 or at most 0 makes the table an object", () => {
    expect(wagoField({ "[1]": "a", "[1001]": "b" })).toBe('{"1":"a","1001":"b"}');
    expect(wagoField({ "[0]": "z", "[1]": "a" })).toBe('{"0":"z","1":"a"}');
    expect(wagoField({ "[-3]": "n", "[2]": "b", x: 1 })).toBe('{"2":"b","-3":"n","x":1}');
  });

  test("number keys are written as LuaJIT's tostring (%.14g)", () => {
    expect(wagoField({ a: 0, "[0.0001]": 1, "[0.00001]": 2, "[123.456]": 3, "[2.5]": 4 })).toBe(
      '{"0.0001":1,"123.456":3,"1e-05":2,"2.5":4,"a":0}',
    );
    expect(wagoField({ a: 0, "[99999999999999]": 1, "[100000000000000]": 2, "[1000000000000001]": 3 })).toBe(
      '{"1e+14":2,"1e+15":3,"99999999999999":1,"a":0}',
    );
  });

  test("a number key whose string is taken moves to the next free integer", () => {
    expect(wagoField({ "1": "s", "[1]": "n1", "[2]": "n2" })).toBe('{"1":"s","2":"n1","3":"n2"}');
    expect(wagoField({ "2": "s", "[2]": "n", "[0.5]": "h", x: 0 })).toBe('{"2":"s","3":"n","0.5":"h","x":0}');
  });

  test("a collision that json.lua resolves in Lua's hash order is refused", () => {
    expect(() => wagoField({ "1001": "s", "[1001]": "n" })).toThrow(/hash order/);
    expect(() => wagoField({ "1": "s", "[1]": "n", "[0]": "z" })).toThrow(/hash order/);
    // Without a collision the order doesn't matter.
    expect(wagoField({ "5": "s", "[1]": "n", "[0]": "z" })).toBe('{"0":"z","1":"n","5":"s"}');
  });

  test("a boolean key is refused with a clear error naming where it is", () => {
    expect(() => wago({ id: "A", load: { "[true]": 1 } })).toThrow(WagoJsonError);
    expect(() => wago({ id: "A", load: { "[true]": 1 } })).toThrow(/boolean keys.*d\.load\[true\]/);
  });

  test("numbers keep 14 significant digits", () => {
    expect(wagoField([0.1 + 0.2, 2 ** 53 - 1, 1 / 3, 1e-7, 1e21, 123.456])).toBe(
      "[0.3,9007199254741000,0.33333333333333,1e-7,1e+21,123.456]",
    );
  });

  test("an exact tie at the 15th digit rounds half to even, as C's printf does", () => {
    expect(wagoField([123456789012345, 123456789012355, 1e14 + 5, 1e14 + 15])).toBe(
      "[123456789012340,123456789012360,100000000000000,100000000000020]",
    );
    expect(wagoField({ a: 0, "[123456789012345]": 1 })).toBe('{"1.2345678901234e+14":1,"a":0}');
  });

  test("-0 is 0; NaN and ±inf are null", () => {
    expect(wagoField([-0, NaN, Infinity, -Infinity])).toBe("[0,null,null,null]");
    expect(wagoField({ "[0]": "z", "[-0.5]": "n" })).toBe('{"0":"z","-0.5":"n"}');
  });

  test("strings are written as JSON.stringify writes them", () => {
    expect(wagoField(['a"b\\c/\n\u0001æ✓'])).toBe('["a\\"b\\\\c/\\n\\u0001æ✓"]');
  });
});

describe("wago JSON → aura", () => {
  const aura = (d: unknown, extra: object = {}) =>
    fromWagoJson(JSON.stringify({ d, m: "d", s: "5.21.9", v: 1421, ...extra }));

  test("the packet's aura, children, sender version and transmission version", () => {
    expect(aura({ id: "G" }, { c: [{ id: "A" }], wagoID: "x" })).toStrictEqual({
      aura: { id: "G" },
      children: [{ id: "A" }],
      senderVersion: "5.21.9",
      transmissionVersion: 1421,
    });
    expect(fromWagoJson('{"d":{"id":"A"}}')).toStrictEqual({ aura: { id: "A" }, children: [] });
  });

  test("pretty and compact text give the same aura", () => {
    const d = { id: "A", color: [1, 1, 1, 1] };
    expect(fromWagoJson(JSON.stringify({ d }, null, 2))).toStrictEqual(fromWagoJson(JSON.stringify({ d })));
  });

  test("triggers and their number-keyed sets get number keys back", () => {
    const result = aura({
      triggers: {
        "1": {
          trigger: {
            form: { multi: { "2": true } },
            talent: { multi: { "5": true, "-1": false } },
            specId: { multi: { "250": true } },
            herotalent: { multi: { "0x10": true } },
            actualSpec: { "62": true },
            arena_spec: { "1": { "268": true } },
          },
          untrigger: [],
        },
        activeTriggerMode: -10,
        disjunctive: "all",
      },
    });
    expect(result.aura.triggers).toStrictEqual({
      "[1]": {
        trigger: {
          form: { multi: { "[2]": true } },
          talent: { multi: { "[5]": true, "-1": false } },
          specId: { multi: { "[250]": true } },
          herotalent: { multi: { "[16]": true } },
          actualSpec: { "[62]": true },
          arena_spec: [{ "268": true }],
        },
        untrigger: {},
      },
      activeTriggerMode: -10,
      disjunctive: "all",
    });
  });

  test("load's talent, hero talent, instance type and class-and-spec sets get number keys back", () => {
    const sets = ["talent", "talent2", "talent3", "herotalent", "instance_type", "class_and_spec"];
    const load = Object.fromEntries(sets.map((s) => [s, { multi: { "7": true } }]));
    const result = aura({ load: { ...load, class: { multi: { "1": true } } } });
    for (const s of sets) expect(result.aura.load).toHaveProperty([s, "multi"], { "[7]": true });
    expect(result.aura.load).toHaveProperty(["class", "multi"], { "1": true });
  });

  test("everywhere else a key stays a string", () => {
    expect(aura({ config: { "1": "a" }, triggers: { "1": { trigger: { other: { "3": 1 } } } } }).aura).toStrictEqual({
      config: { "1": "a" },
      triggers: [{ trigger: { other: { "3": 1 } } }],
    });
  });

  test("arrays are sequences, null leaves a hole, [] and {} are the empty table", () => {
    expect(aura({ a: [1, null, 3], b: [], c: {}, d: [null], e: null }).aura).toStrictEqual({
      a: { "[1]": 1, "[3]": 3 },
      b: {},
      c: {},
      d: {},
    });
  });

  test("numbers stay as given", () => {
    const result = fromWagoJson('{"d":{"x":0.12345678901234568,"y":123456789012345,"z":-0,"w":1e-7}}').aura;
    expect(result.x).toBe(0.12345678901234568);
    expect(result.y).toBe(123456789012345);
    expect(Object.is(result.z, -0)).toBe(true);
    expect(result.w).toBe(1e-7);
  });

  test("two keys that are the same number on a wago path are refused (hash order)", () => {
    expect(() => aura({ triggers: { "1": {}, "01": {} } })).toThrow(/hash order/);
  });

  test("text that isn't wago JSON of an aura is refused", () => {
    expect(() => fromWagoJson("!WA:2!abc")).toThrow(WagoJsonError);
    expect(() => fromWagoJson('{"m":"d"}')).toThrow(/"d"/);
    expect(() => fromWagoJson('{"d":{"id":"A"},"c":{"1":{}}}')).toThrow(/"c"/);
    expect(() => fromWagoJson('{"d":{"x":1e400}}')).toThrow(WagoJsonError);
  });

  test("aura → JSON → aura keeps an aura whose number keys are all on wago's paths", () => {
    const original = {
      id: "A",
      color: [1, 0.5, 0, 1],
      triggers: { "[1]": { trigger: { type: "aura2", auraspellids: ["31033"] } }, disjunctive: "all" },
      load: { talent: { multi: { "[12]": true } }, class: { single: "MAGE" } },
    };
    const json = toWagoJson({ aura: original, children: [], senderVersion: "x", transmissionVersion: 1421 });
    expect(fromWagoJson(json).aura).toStrictEqual(original);
  });
});
