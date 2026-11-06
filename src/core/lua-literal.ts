/**
 * Readable Lua table literals for aura documents: a pretty printer and a parser for the subset of Lua
 * that writes data (what WeakAuras users see in SavedVariables and `/dump`):
 *
 *   {
 *     id = "Arcane Intellect",
 *     triggers = {
 *       [1] = { trigger = { ... } },
 *       disjunctive = "any",
 *     },
 *     color = { 1, 1, 1, 1 },
 *   }
 *
 * The mapping to the document model (lua-value.ts) is lossless: number, boolean and string keys stay
 * apart (`[1] = ` vs `["1"] = `), mixed and sparse tables stay as they are, and strings may hold any text.
 * The parser follows Lua 5.1's lexical rules (all string escapes, long strings and comments, decimal and
 * hex numbers) and Lua's table constructor semantics (positional values count 1, 2, ...; `nil` values
 * leave no entry). It accepts literals only, no expressions or calls, and an optional leading `return`.
 * Unlike Lua it rejects a key given twice, since one of the two would silently be lost.
 */

import { canonicalize, isLuaTable, keyFromString, keyToString, type LuaKey, type LuaObject, type LuaValue } from "./lua-value";

/** A literal that doesn't parse. `line` and `column` are 1-based and point at the offending token. */
export class LuaLiteralError extends Error {
  constructor(
    readonly reason: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`Line ${line}, column ${column}: ${reason}`);
    this.name = "LuaLiteralError";
  }
}

// ---------------------------------------------------------------------------------------------- printer

const RESERVED = new Set(
  "and break do else elseif end false for function if in local nil not or repeat return then true until while".split(" "),
);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_INLINE = 72;

/** A Lua string literal; non-ASCII text stays readable, control characters are escaped. */
export function luaString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (c < 0x20 || c === 0x7f) out += `\\${String(c).padStart(3, "0")}`;
    else out += ch;
  }
  return out + '"';
}

function luaNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Lua values must be finite numbers, got ${n}`);
  return Object.is(n, -0) ? "-0" : String(n);
}

function luaScalar(v: LuaKey): string {
  if (typeof v === "string") return luaString(v);
  if (typeof v === "boolean") return String(v);
  return luaNumber(v);
}

function luaKey(key: LuaKey): string {
  if (typeof key === "string" && IDENTIFIER.test(key) && !RESERVED.has(key)) return key;
  return `[${luaScalar(key)}]`;
}

/** Key order: numbers ascending, then booleans, then strings in code-point order. */
function compareKeys(a: LuaKey, b: LuaKey): number {
  const rank = (k: LuaKey) => (typeof k === "number" ? 0 : typeof k === "boolean" ? 1 : 2);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean") return a === b ? 0 : a ? 1 : -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function printValue(value: LuaValue, indent: string): string {
  if (!isLuaTable(value)) return luaScalar(value);
  const inner = indent + "  ";
  const items: string[] = Array.isArray(value)
    ? value.map((v) => printValue(v, inner))
    : Object.keys(value)
        .map((k) => [keyFromString(k), value[k]] as const)
        .sort(([a], [b]) => compareKeys(a, b))
        .map(([k, v]) => `${luaKey(k)} = ${printValue(v, inner)}`);
  if (items.length === 0) return "{}";
  const flat = `{ ${items.join(", ")} }`;
  if (!flat.includes("\n") && flat.length + indent.length <= MAX_INLINE && (Array.isArray(value) || items.length <= 4)) {
    return flat;
  }
  return `{\n${items.map((item) => `${inner}${item},`).join("\n")}\n${indent}}`;
}

/** Pretty Lua source for a document value: sequences positional, other keys explicit, keys sorted. */
export function printLuaLiteral(value: LuaValue): string {
  return printValue(canonicalize(value), "");
}

// ----------------------------------------------------------------------------------------------- parser

type Token =
  | { kind: "string"; value: string; pos: number }
  | { kind: "number"; value: number; pos: number }
  | { kind: "name"; value: string; pos: number }
  | { kind: "symbol"; value: string; pos: number }
  | { kind: "eof"; value: ""; pos: number };

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8");

class Lexer {
  pos = 0;
  constructor(readonly src: string) {}

  fail(reason: string, pos = this.pos): never {
    let line = 1;
    let lineStart = 0;
    for (let i = 0; i < pos && i < this.src.length; i++) {
      if (this.src[i] === "\n") {
        line++;
        lineStart = i + 1;
      }
    }
    throw new LuaLiteralError(reason, line, pos - lineStart + 1);
  }

  next(): Token {
    this.skipSpaceAndComments();
    const src = this.src;
    const start = this.pos;
    if (start >= src.length) return { kind: "eof", value: "", pos: start };
    const ch = src[start];
    if (ch === '"' || ch === "'") return { kind: "string", value: this.quotedString(ch), pos: start };
    if (ch === "[" && /^\[=*\[/.test(src.slice(start, start + 64))) {
      return { kind: "string", value: this.longBracket(), pos: start };
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[start + 1] ?? ""))) {
      return { kind: "number", value: this.number(), pos: start };
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(start))!;
      this.pos += m[0].length;
      return { kind: "name", value: m[0], pos: start };
    }
    if ("{}[]=,;-".includes(ch)) {
      this.pos++;
      return { kind: "symbol", value: ch, pos: start };
    }
    this.fail(`unexpected character ${JSON.stringify(ch)}`);
  }

  private skipSpaceAndComments() {
    const src = this.src;
    for (;;) {
      while (this.pos < src.length && /\s/.test(src[this.pos])) this.pos++;
      if (!src.startsWith("--", this.pos)) return;
      this.pos += 2;
      if (src[this.pos] === "[" && /^\[=*\[/.test(src.slice(this.pos, this.pos + 64))) {
        this.longBracket();
      } else {
        while (this.pos < src.length && src[this.pos] !== "\n") this.pos++;
      }
    }
  }

  /** `[[...]]`, `[==[...]==]`; a newline right after the opening bracket is skipped, as in Lua. */
  private longBracket(): string {
    const start = this.pos;
    const level = /^\[(=*)\[/.exec(this.src.slice(start))![1].length;
    const close = `]${"=".repeat(level)}]`;
    let from = start + level + 2;
    if (this.src[from] === "\r") from += this.src[from + 1] === "\n" ? 2 : 1;
    else if (this.src[from] === "\n") from += this.src[from + 1] === "\r" ? 2 : 1;
    const end = this.src.indexOf(close, from);
    if (end < 0) this.fail("unfinished long string or comment", start);
    this.pos = end + close.length;
    return this.src.slice(from, end).replace(/\r\n?/g, "\n");
  }

  private quotedString(quote: string): string {
    const src = this.src;
    const start = this.pos;
    this.pos++;
    const bytes: number[] = [];
    const text = (s: string) => {
      for (const b of utf8Encoder.encode(s)) bytes.push(b);
    };
    for (;;) {
      if (this.pos >= src.length) this.fail("unfinished string", start);
      const ch = src[this.pos];
      if (ch === quote) {
        this.pos++;
        break;
      }
      if (ch === "\n" || ch === "\r") this.fail("unfinished string", start);
      if (ch !== "\\") {
        const cp = src.codePointAt(this.pos)!;
        const s = String.fromCodePoint(cp);
        text(s);
        this.pos += s.length;
        continue;
      }
      const escPos = this.pos;
      const e = src[this.pos + 1];
      this.pos += 2;
      const simple: Record<string, number> = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, "\\": 92, '"': 34, "'": 39 };
      if (e !== undefined && e in simple) bytes.push(simple[e]);
      else if (e === "\n" || e === "\r") {
        bytes.push(10);
        const other = e === "\n" ? "\r" : "\n";
        if (src[this.pos] === other) this.pos++;
      } else if (e !== undefined && /[0-9]/.test(e)) {
        const m = /^[0-9]{1,3}/.exec(src.slice(this.pos - 1))!;
        const n = Number(m[0]);
        if (n > 255) this.fail("escape sequence too large", escPos);
        bytes.push(n);
        this.pos += m[0].length - 1;
      } else if (e === undefined) {
        this.fail("unfinished string", start);
      } else {
        // Lua 5.1 keeps the character after an unknown backslash.
        text(e);
      }
    }
    return utf8Decoder.decode(new Uint8Array(bytes));
  }

  private number(): number {
    const rest = this.src.slice(this.pos);
    const hex = /^0[xX][0-9a-fA-F]+/.exec(rest);
    const dec = /^(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(rest);
    const m = hex ?? dec!;
    // Lua reads a number as the longest run of number-ish characters; trailing letters make it malformed.
    if (/^[A-Za-z0-9_.]/.test(rest.slice(m[0].length))) {
      this.fail(`malformed number near ${JSON.stringify(/^[A-Za-z0-9_.+-]+/.exec(rest)![0])}`);
    }
    this.pos += m[0].length;
    return hex ? parseInt(m[0].slice(2), 16) : Number(m[0]);
  }
}

class Parser {
  private tok: Token;
  constructor(private readonly lex: Lexer) {
    this.tok = lex.next();
  }

  private advance(): Token {
    const t = this.tok;
    this.tok = this.lex.next();
    return t;
  }

  private describe(t: Token): string {
    if (t.kind === "eof") return "the end of the text";
    if (t.kind === "string") return "a string";
    return `'${t.value}'`;
  }

  private expect(symbol: string, what = `'${symbol}'`): Token {
    if (this.tok.kind !== "symbol" || this.tok.value !== symbol) {
      this.lex.fail(`${what} expected near ${this.describe(this.tok)}`, this.tok.pos);
    }
    return this.advance();
  }

  private isSymbol(s: string) {
    return this.tok.kind === "symbol" && this.tok.value === s;
  }

  parseChunk(): LuaValue {
    if (this.tok.kind === "name" && this.tok.value === "return") this.advance();
    const value = this.value();
    if (value === null) this.lex.fail("the text must be a value, not nil", 0);
    if (this.isSymbol(";")) this.advance();
    if (this.tok.kind !== "eof") this.lex.fail(`unexpected ${this.describe(this.tok)} after the table`, this.tok.pos);
    return value;
  }

  /** A value, or null for `nil`. */
  private value(): LuaValue | null {
    const t = this.tok;
    switch (t.kind) {
      case "string":
        this.advance();
        return t.value;
      case "number":
        this.advance();
        return this.checkNumber(t.value, t.pos);
      case "name":
        if (t.value === "true" || t.value === "false") {
          this.advance();
          return t.value === "true";
        }
        if (t.value === "nil") {
          this.advance();
          return null;
        }
        return this.lex.fail(`unexpected '${t.value}' (only literal values are allowed)`, t.pos);
      case "symbol":
        if (t.value === "{") return this.table();
        if (t.value === "-") {
          this.advance();
          const n = this.tok;
          if (n.kind !== "number") this.lex.fail("a number expected after '-'", n.pos);
          this.advance();
          return this.checkNumber(-n.value, t.pos);
        }
        return this.lex.fail(`unexpected ${this.describe(t)}`, t.pos);
      case "eof":
        return this.lex.fail("a value expected near the end of the text", t.pos);
    }
  }

  private checkNumber(n: number, pos: number): number {
    if (!Number.isFinite(n)) this.lex.fail("the number is too large", pos);
    if (Number.isInteger(n) && !Number.isSafeInteger(n)) {
      this.lex.fail("whole numbers must be within ±(2^53 - 1) to survive a state code", pos);
    }
    return n;
  }

  private table(): LuaValue {
    const open = this.expect("{");
    const result = new Map<string, LuaValue>();
    const keyPos = new Map<string, number>();
    let positional = 0;
    const set = (key: LuaKey, value: LuaValue | null, pos: number) => {
      const k = keyToString(key);
      if (keyPos.has(k)) this.lex.fail(`key ${luaKey(key)} is given twice`, pos);
      keyPos.set(k, pos);
      if (value !== null) result.set(k, value);
    };
    while (!this.isSymbol("}")) {
      const t = this.tok;
      if (t.kind === "eof") this.lex.fail("'}' expected to close the table opened here", open.pos);
      if (this.isSymbol("[")) {
        this.advance();
        const keyTok = this.tok;
        const key = this.value();
        if (key === null) this.lex.fail("a table key can't be nil", keyTok.pos);
        if (isLuaTable(key)) this.lex.fail("a table key can't be a table", keyTok.pos);
        this.expect("]");
        this.expect("=");
        set(key, this.value(), t.pos);
      } else if (t.kind === "name" && !RESERVED.has(t.value) && this.peekIsEquals()) {
        this.advance();
        this.expect("=");
        set(t.value, this.value(), t.pos);
      } else {
        positional++;
        set(positional, this.value(), t.pos);
      }
      if (this.isSymbol(",") || this.isSymbol(";")) this.advance();
      else if (!this.isSymbol("}")) this.lex.fail(`'}' or ',' expected near ${this.describe(this.tok)}`, this.tok.pos);
    }
    this.advance();
    const obj: LuaObject = {};
    for (const [k, v] of result) obj[k] = v;
    return canonicalize(obj);
  }

  /** Whether the token after the current name is `=` (so the name is a key, not a value). */
  private peekIsEquals(): boolean {
    const save = this.lex.pos;
    const t = this.lex.next();
    this.lex.pos = save;
    return t.kind === "symbol" && t.value === "=";
  }
}

/** Parses a Lua literal into its canonical document value. Throws `LuaLiteralError` with a position. */
export function parseLuaLiteral(text: string): LuaValue {
  return new Parser(new Lexer(text)).parseChunk();
}

// ------------------------------------------------------------------------------------------------- JSON

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
    const message = e instanceof Error ? e.message : String(e);
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
