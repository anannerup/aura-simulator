/**
 * The aura document model: a Lua table represented as plain JSON-compatible JS data, losslessly.
 *
 * Mapping (Lua -> JS):
 * - string  -> string, number -> number, boolean -> boolean
 * - a table whose keys are exactly the integers 1..n (n >= 1) -> array (`LuaArray`)
 * - any other table (including the empty table) -> object (`LuaObject`)
 *
 * Object keys say which Lua key type they stand for, in Lua literal syntax:
 * - `name`      -> the string key "name" (any key that doesn't start with "[")
 * - `[1]`       -> the number key 1 (numbers in shortest round-trip form, e.g. `[0.5]`, `[-3]`)
 * - `[true]`    -> the boolean key true
 * - `["[x"]`    -> the string key "[x" (only string keys starting with "[" are written this way)
 *
 * So `{"1": ...}` is Lua `{["1"] = ...}` and `{"[1]": ...}` is Lua `{[1] = ...}`, and mixed tables such as
 * WeakAuras' `triggers` (`{[1] = {...}, disjunctive = "any"}`) stay mixed: `{"[1]": {...}, "disjunctive": "any"}`.
 * Tables used as keys, functions and nil holes are not representable (WeakAuras data never uses them).
 *
 * Decoding always yields the canonical form; `canonicalize` turns any accepted input into it.
 */

export type LuaValue = string | number | boolean | LuaTable;
export type LuaTable = LuaArray | LuaObject;
export type LuaArray = LuaValue[];
export interface LuaObject {
  [key: string]: LuaValue;
}

export type LuaKey = string | number | boolean;

/** Turns a Lua key into its object-key form. */
export function keyToString(key: LuaKey): string {
  if (typeof key === "string") return key.startsWith("[") ? `[${JSON.stringify(key)}]` : key;
  if (typeof key === "boolean") return `[${key}]`;
  if (!Number.isFinite(key)) throw new Error(`Lua table key must be a finite number, got ${key}`);
  return `[${String(key)}]`;
}

/** Reads an object key back into the Lua key it stands for. */
export function keyFromString(key: string): LuaKey {
  if (!key.startsWith("[")) return key;
  if (!key.endsWith("]")) throw new Error(`Malformed Lua key "${key}"`);
  const inner = key.slice(1, -1);
  if (inner.startsWith('"')) {
    const parsed: unknown = JSON.parse(inner);
    if (typeof parsed !== "string") throw new Error(`Malformed Lua key "${key}"`);
    return parsed;
  }
  if (inner === "true") return true;
  if (inner === "false") return false;
  const n = inner.trim() === "" ? NaN : Number(inner);
  if (!Number.isFinite(n)) throw new Error(`Malformed Lua key "${key}"`);
  return n;
}

export function isLuaTable(value: unknown): value is LuaTable {
  return typeof value === "object" && value !== null;
}

/** All entries of a table as [Lua key, value] pairs. */
export function entries(table: LuaTable): [LuaKey, LuaValue][] {
  if (Array.isArray(table)) return table.map((v, i) => [i + 1, v]);
  return Object.entries(table).map(([k, v]) => [keyFromString(k), v]);
}

/** Lua's `t[key]`. */
export function getField(table: LuaTable, key: LuaKey): LuaValue | undefined {
  if (Array.isArray(table)) {
    return typeof key === "number" && Number.isInteger(key) && key >= 1 ? table[key - 1] : undefined;
  }
  const k = keyToString(key);
  return Object.prototype.hasOwnProperty.call(table, k) ? table[k] : undefined;
}

/**
 * Returns the canonical form of a value: sequences become arrays, everything else objects,
 * the empty table `{}`, number keys in shortest form. Object values that are `undefined`/`null`
 * are dropped (Lua nil); `null` inside arrays is rejected (Lua sequences can't have holes).
 */
export function canonicalize(value: LuaValue): LuaValue {
  if (!isLuaTable(value)) return checkScalar(value);
  const pairs = new Map<string, [LuaKey, LuaValue]>();
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      if (v === null || v === undefined) throw new Error(`Lua array has a hole at index ${i + 1}`);
      pairs.set(keyToString(i + 1), [i + 1, canonicalize(v)]);
    });
  } else {
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined) continue;
      const key = keyFromString(k);
      const canonicalKey = keyToString(key);
      if (pairs.has(canonicalKey)) throw new Error(`Duplicate Lua key ${canonicalKey}`);
      pairs.set(canonicalKey, [key, canonicalize(v)]);
    }
  }
  const n = pairs.size;
  let isSequence = n > 0;
  for (let i = 1; isSequence && i <= n; i++) isSequence = pairs.has(`[${i}]`);
  if (isSequence) {
    const arr: LuaArray = [];
    for (let i = 1; i <= n; i++) arr.push(pairs.get(`[${i}]`)![1]);
    return arr;
  }
  const obj: LuaObject = {};
  for (const [k, [, v]] of pairs) obj[k] = v;
  return obj;
}

function checkScalar(value: LuaValue): LuaValue {
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) throw new Error(`Lua values must be finite numbers, got ${value}`);
      // The addon's LibSerialize stores whole numbers as integers and garbles those past 2^53.
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
        throw new Error(`Whole numbers must be within ±(2^53 - 1) to survive a state code, got ${value}`);
      }
      return value;
    default:
      throw new Error(`Not a Lua value: ${String(value)}`);
  }
}

const utf8 = new TextEncoder();

function luaStringLiteral(s: string): string {
  let out = '"';
  for (const byte of utf8.encode(s)) {
    if (byte >= 0x20 && byte < 0x7f && byte !== 0x22 && byte !== 0x5c) out += String.fromCharCode(byte);
    else out += `\\${byte}`;
  }
  return out + '"';
}

/** A Lua number literal (shortest round-trip form, `-0` kept). */
export function luaNumberLiteral(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Lua values must be finite numbers, got ${n}`);
  return Object.is(n, -0) ? "-0" : String(n);
}

function luaScalarLiteral(value: LuaKey): string {
  if (typeof value === "string") return luaStringLiteral(value);
  if (typeof value === "boolean") return String(value);
  return luaNumberLiteral(value);
}

/** Lua source for a value (a table constructor for tables). Pure ASCII. */
export function toLuaLiteral(value: LuaValue): string {
  if (!isLuaTable(value)) return luaScalarLiteral(checkScalar(value) as LuaKey);
  const parts: string[] = [];
  for (const [k, v] of entries(value)) {
    if (v === null || v === undefined) {
      if (Array.isArray(value)) throw new Error("Lua array has a hole");
      continue;
    }
    parts.push(`[${luaScalarLiteral(k)}]=${toLuaLiteral(v)}`);
  }
  return `{${parts.join(",")}}`;
}

/** One aura's table, as the addon stores it. */
export type AuraDocument = LuaObject;

/** What a state code holds: an aura (or group) and, for groups, all its descendants. */
export interface AuraState {
  aura: AuraDocument;
  /** Every descendant of a group, flattened in the addon's traversal order. Empty for a single aura. */
  children: AuraDocument[];
}
