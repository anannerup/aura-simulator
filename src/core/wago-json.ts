/**
 * wago JSON: the JSON form wago.io shows for an aura (its Editor's "Table data", and `json` of its data API), and
 * the way back. The rules, with wago.io source references, are in `.scratch/tbc-anniversary/wago-json.md`.
 *
 * Aura → JSON restates wago's pipeline: its modified json.lua (Friedl's JSON.lua) encodes the decoded transmit
 * table under LuaJIT, Node parses that, `addWagoData` adds the top-level `wagoID` and drops the two update flags,
 * and `sortJSON` sorts every object. JSON → aura restates wago's rebuild (`encode` in `WeakAura.js`): json.lua
 * decodes it, and `fixWATables` turns string keys back into number keys on a fixed list of paths only.
 */
import type { DecodedState } from "./aura-core";
import { canonicalize, entries, isLuaTable, keyToString, type AuraDocument, type LuaKey, type LuaObject, type LuaValue } from "./lua-value";

/** Thrown when an aura has no wago JSON (or wago JSON no aura), with the reason in plain words. */
export class WagoJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WagoJsonError";
  }
}

/** A JSON value as wago writes it (what `JSON.parse` of its text gives). */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface WagoJsonOptions {
  /** `pretty`: wago's Editor text (2-space `JSON.stringify`). `compact`: what wago stores and its API returns. */
  format?: "pretty" | "compact";
}

/**
 * An aura (with its group's children and the packet's sender version and transmission version) as wago JSON,
 * byte-identical to wago's for an aura that came from wago. wago's own stamp (`wagoID`, `url`, `version`, `semver`
 * in each aura) is only there when the aura carries it; the top-level `wagoID` is copied from the aura's.
 * Throws WagoJsonError for a table wago can't encode (boolean keys) or whose JSON depends on Lua's hash order.
 */
export function toWagoJson(state: DecodedState, options: WagoJsonOptions = {}): string {
  const packet: LuaObject = { d: state.aura, m: "d" };
  if (state.children.length > 0) packet.c = state.children;
  if (state.senderVersion !== undefined) packet.s = state.senderVersion;
  if (state.transmissionVersion !== undefined) packet.v = state.transmissionVersion;
  const json = encodeValue(packet, "") as { [key: string]: Json };
  // addWagoData: the top-level stamp, and the update flags wago drops from every aura.
  const auras = [json.d, ...(Array.isArray(json.c) ? json.c : [])];
  for (const aura of auras) {
    if (isJsonObject(aura)) {
      delete aura.ignoreWagoUpdate;
      delete aura.skipWagoUpdate;
    }
  }
  if (isJsonObject(json.d) && typeof json.d.wagoID === "string") json.wagoID = json.d.wagoID;
  const sorted = sortJson(json);
  return options.format === "compact" ? JSON.stringify(sorted) : JSON.stringify(sorted, null, 2);
}

function isJsonObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** json.lua's `encode_value` followed by Node's `JSON.parse`. */
function encodeValue(value: LuaValue, path: string): Json {
  if (typeof value === "number") return roundG14(value);
  if (!isLuaTable(value)) return value;
  const pairs = entries(value);
  const bad = pairs.find(([k]) => typeof k === "boolean");
  if (bad) {
    throw new WagoJsonError(
      `wago JSON can't hold boolean keys, and wago.io can't import such an aura: ${path}[${String(bad[0])}]`,
    );
  }
  if (pairs.length === 0) return [];
  const at = (k: LuaKey) => `${path}${typeof k === "number" ? `[${luaToString(k)}]` : path ? `.${k}` : k}`;
  const numbers = pairs.filter((p): p is [number, LuaValue] => typeof p[0] === "number");
  if (numbers.length === pairs.length && numbers.every(([k]) => k > 0 && k <= 1000)) {
    // An array of length max key: holes become null, a fractional key only counts toward the length.
    const byKey = new Map(numbers);
    const max = Math.max(...numbers.map(([k]) => k));
    const out: Json[] = [];
    for (let i = 1; i <= max; i++) {
      const item = byKey.get(i);
      out.push(item === undefined ? null : encodeValue(item, at(i)));
    }
    return out;
  }
  return encodeObject(pairs, at);
}

/**
 * json.lua's `object_or_array` for a table that becomes an object. String keys stay. Number keys become
 * `tostring(key)`; when that string is taken, a key in (0, 1000] moves to the next free `tostring(key + n)`.
 * A key ≤ 0 or > 1000 makes json.lua write the number keys it meets after it (in Lua's hash order) without that
 * check, so if any number key's string is taken in such a table, the result depends on hash order: refused.
 */
function encodeObject(pairs: [LuaKey, LuaValue][], at: (k: LuaKey) => string): Json {
  const out = new Map<string, Json>();
  const numbers: [number, LuaValue][] = [];
  for (const [k, v] of pairs) {
    if (typeof k === "number") numbers.push([k, v]);
    else out.set(k as string, encodeValue(v, at(k)));
  }
  numbers.sort(([a], [b]) => a - b);
  const unchecked = numbers.some(([k]) => k <= 0 || k > 1000);
  for (const [k, v] of numbers) {
    let key = luaToString(k);
    if (out.has(key)) {
      if (unchecked) {
        throw new WagoJsonError(
          `wago's JSON for ${at(k)} depends on Lua's hash order: the number key ${key} and the string key "${key}" ` +
            "(or another number with the same 14-digit form) are in a table with a key ≤ 0 or > 1000",
        );
      }
      for (let next = k + 1; out.has(key); next++) key = luaToString(next);
    }
    out.set(key, encodeValue(v, at(k)));
  }
  return Object.fromEntries(out) as { [key: string]: Json };
}

/** wago's `sortJSON`: every object's keys in `<` order (JS then lists integer-like keys first), arrays in place. */
function sortJson(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== "object") return value;
  const sorted: { [key: string]: Json } = {};
  for (const key of Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    // sortJSON assigns `s[key] = …`: for "__proto__" that sets the prototype, so wago loses the key.
    if (key === "__proto__") continue;
    sorted[key] = sortJson(value[key]);
  }
  return sorted;
}

/** The 14 significant digits C's `%.14g` keeps (round half to even on the exact binary value), and the exponent. */
function digits14(x: number): { digits: string; exponent: number } {
  // 100 significant digits: exact for every tie (a tie has at most ~36), and no non-tie is close enough to look like one.
  const [mantissa, exp] = Math.abs(x).toExponential(99).split("e");
  const all = mantissa.replace(".", "");
  let kept = Number(all.slice(0, 14)); // < 2^53: exact
  const rest = all.slice(14);
  const roundUp = rest[0] > "5" || (rest[0] === "5" && (/[1-9]/.test(rest.slice(1)) || kept % 2 === 1));
  if (roundUp) kept += 1;
  let exponent = Number(exp);
  let digits = String(kept);
  if (digits.length > 14) {
    digits = digits.slice(0, 14);
    exponent += 1;
  }
  return { digits, exponent };
}

/** A number as LuaJIT's `tostring` writes it (`%.14g`, `-0`, `inf`, `nan`). */
function luaToString(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0" : "0";
  const sign = x < 0 ? "-" : "";
  const { digits, exponent } = digits14(x);
  const trimmed = digits.replace(/0+$/, "");
  if (exponent < -4 || exponent >= 14) {
    const mantissa = trimmed.length > 1 ? `${trimmed[0]}.${trimmed.slice(1)}` : trimmed;
    const e = Math.abs(exponent).toString().padStart(2, "0");
    return `${sign}${mantissa}e${exponent < 0 ? "-" : "+"}${e}`;
  }
  if (exponent < 0) return `${sign}0.${"0".repeat(-exponent - 1)}${trimmed}`;
  const whole = trimmed.slice(0, exponent + 1).padEnd(exponent + 1, "0");
  const fraction = trimmed.slice(exponent + 1);
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** A number value as it reaches wago's JSON: `%.14g`, then parsed by Node; NaN and ±inf become null. */
function roundG14(x: number): number | null {
  if (!Number.isFinite(x)) return null;
  if (x === 0) return x;
  const { digits, exponent } = digits14(x);
  return Math.sign(x) * Number(`${digits}e${exponent - 13}`);
}

/**
 * wago JSON (pretty or compact) back to an aura, as wago rebuilds an import string from it: JSON objects become
 * tables with string keys, arrays sequences (null leaves a hole), numbers stay as given, and string keys become
 * number keys only on wago's paths (`triggers`, its triggers' `.multi` sets, `actualSpec`, `arena_spec`, and
 * `load.*.multi`). Throws WagoJsonError for text that isn't wago JSON of an aura.
 */
export function fromWagoJson(text: string): DecodedState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new WagoJsonError(`Not JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.d)) {
    throw new WagoJsonError('Not wago JSON of an aura: it needs a "d" object (the aura)');
  }
  const aura = rebuildAura(decodeValue(parsed.d as Json), "d");
  let children: AuraDocument[] = [];
  if (parsed.c !== undefined && parsed.c !== null) {
    if (!Array.isArray(parsed.c)) throw new WagoJsonError('"c" (the group\'s children) must be an array');
    children = (parsed.c as Json[]).map((child, i) => {
      if (!isPlainObject(child)) throw new WagoJsonError(`c[${i + 1}] must be an aura object`);
      return rebuildAura(decodeValue(child), `c[${i + 1}]`);
    });
  }
  const state: DecodedState = { aura, children };
  if (typeof parsed.s === "string") state.senderVersion = parsed.s;
  if (typeof parsed.v === "number") state.transmissionVersion = parsed.v;
  return state;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A Lua table under construction: Lua key → value, in insertion order. */
type Table = Map<LuaKey, Value>;
type Value = string | number | boolean | Table;

/** json.lua's `JSON:decode` of one value: null is nil, array items keep their index across nulls. */
function decodeValue(json: Json): Value | undefined {
  if (json === null) return undefined;
  if (typeof json !== "object") return json;
  const table: Table = new Map();
  if (Array.isArray(json)) {
    json.forEach((item, i) => {
      const v = decodeValue(item);
      if (v !== undefined) table.set(i + 1, v);
    });
  } else {
    for (const [k, item] of Object.entries(json)) {
      const v = decodeValue(item);
      if (v !== undefined) table.set(k, v);
    }
  }
  return table;
}

/** `fixWATables` on one aura, then our canonical aura document. */
function rebuildAura(value: Value | undefined, path: string): AuraDocument {
  const aura = value as Table;
  const fix = (table: Table, key: string, at: string) => {
    const target = table.get(key);
    if (target === undefined || target === false) return;
    if (!(target instanceof Map)) throw new WagoJsonError(`wago can't rebuild ${at}: it must be a table`);
    table.set(key, fixNumericIndexes(target, at));
  };
  const sub = (table: Value | undefined, key: string): Value | undefined =>
    table instanceof Map ? table.get(key) : undefined;
  if (sub(aura, "triggers") !== undefined) {
    fix(aura, "triggers", `${path}.triggers`);
    const triggers = aura.get("triggers") as Table;
    for (let n = 1; triggers.get(n) !== undefined; n++) {
      const trigger = sub(triggers.get(n), "trigger");
      if (!(trigger instanceof Map)) continue;
      const at = `${path}.triggers[${n}].trigger`;
      if (sub(trigger, "form") instanceof Map && sub(sub(trigger, "form"), "multi")) {
        fix(trigger.get("form") as Table, "multi", `${at}.form.multi`);
      }
      for (const set of ["talent", "specId", "herotalent"]) {
        const holder = sub(trigger, set);
        if (holder instanceof Map) fix(holder, "multi", `${at}.${set}.multi`);
      }
      fix(trigger, "actualSpec", `${at}.actualSpec`);
      fix(trigger, "arena_spec", `${at}.arena_spec`);
    }
  }
  const load = sub(aura, "load");
  if (load instanceof Map) {
    for (const set of ["talent", "talent2", "talent3", "herotalent", "instance_type", "class_and_spec"]) {
      const holder = sub(load, set);
      if (holder instanceof Map) fix(holder, "multi", `${path}.load.${set}.multi`);
    }
  }
  try {
    const doc = canonicalize(toLuaValue(aura));
    return doc as AuraDocument;
  } catch (e) {
    throw new WagoJsonError(`${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** wago's `fixNumericIndexes`: every key `tonumber` reads as a number > 0 becomes that number key. */
function fixNumericIndexes(table: Table, at: string): Table {
  const fixed: Table = new Map();
  for (const [k, v] of table) {
    const n = luaToNumber(k);
    const key = n !== undefined && n > 0 ? n : k;
    if (fixed.has(key)) {
      throw new WagoJsonError(
        `wago's rebuild of ${at} depends on Lua's hash order: two keys are the number key ${luaToString(key as number)}`,
      );
    }
    fixed.set(key, v);
  }
  return fixed;
}

/** Lua's `tonumber` for a key: numbers as they are; strings in decimal or hex notation, surrounding space allowed. */
function luaToNumber(key: LuaKey): number | undefined {
  if (typeof key === "number") return key;
  if (typeof key !== "string") return undefined;
  const s = key.replace(/^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g, "");
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
  const hex = /^([-+]?)0[xX]([0-9a-fA-F]+)$/.exec(s);
  if (hex) return (hex[1] === "-" ? -1 : 1) * parseInt(hex[2], 16);
  return undefined;
}

function toLuaValue(value: Value): LuaValue {
  if (!(value instanceof Map)) return value;
  const obj: LuaObject = {};
  for (const [k, v] of value) {
    Object.defineProperty(obj, keyToString(k), { value: toLuaValue(v), enumerable: true, writable: true, configurable: true });
  }
  return obj;
}
