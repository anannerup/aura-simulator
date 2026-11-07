/** The canonical JSON form of aura documents (see lua-value.ts), printed for people and parsed back. */
import { LuaLiteralError } from "./lua-literal";
import { canonicalize, isLuaTable, type LuaValue } from "./lua-value";
import { errorMessage } from "@/lib/errors";

const MAX_INLINE = 72;

function printJsonValue(value: LuaValue, indent: string): string {
  if (!isLuaTable(value)) return JSON.stringify(value);
  const inner = indent + "  ";
  const items = Array.isArray(value)
    ? value.map((v) => printJsonValue(v, inner))
    : Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${printJsonValue(v, inner)}`);
  if (items.length === 0) return Array.isArray(value) ? "[]" : "{}";
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  if (Array.isArray(value) && value.every((v) => !isLuaTable(v))) {
    const flat = `${open}${items.join(", ")}${close}`;
    if (flat.length + indent.length <= MAX_INLINE) return flat;
  }
  return `${open}\n${items.map((i) => inner + i).join(",\n")}\n${indent}${close}`;
}

/** The canonical JSON form (see lua-value.ts), indented, with short scalar arrays on one line. */
export function printCanonicalJson(value: LuaValue): string {
  return printJsonValue(canonicalize(value), "");
}

/** Parses the canonical JSON form (any accepted input form, canonicalized). Errors carry a position when known. */
export function parseCanonicalJson(text: string): LuaValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const message = errorMessage(e);
    const m = /position (\d+)/.exec(message);
    if (m) {
      const pos = Number(m[1]);
      const before = text.slice(0, pos).split("\n");
      throw new LuaLiteralError(message.replace(/ in JSON at position.*$/, ""), before.length, before.at(-1)!.length + 1);
    }
    throw e;
  }
  if (parsed === null) throw new Error("The text must be a value, not null");
  return canonicalize(parsed as LuaValue);
}
