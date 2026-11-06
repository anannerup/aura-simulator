import { canonicalize, isLuaTable, type AuraCore, type AuraDocument, type LuaValue } from "@/core";

/** What an agent may push: a state code, or an aura document (plus a group's descendants). */
export type PushInput = { code: string } | { aura: AuraDocument; children: AuraDocument[] };

/** A request the caller got wrong; `status` is the HTTP status to answer with. */
export class PushError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const MAX_BODY_CHARS = 2_000_000;

/**
 * Reads a push body: JSON `{code}` or `{aura, children?}`, or a bare state code as text
 * (so `curl --data-binary @aura.txt` works).
 */
export function parsePushBody(text: string, contentType: string | null): PushInput {
  if (text.length > MAX_BODY_CHARS) throw new PushError("Body too large", 413);
  const trimmed = text.trim();
  if (!contentType?.includes("json") && trimmed.startsWith("!WA:2!")) return { code: trimmed };
  let body: unknown;
  try {
    body = JSON.parse(trimmed);
  } catch {
    throw new PushError('Send JSON {"code": "!WA:2!..."} or {"aura": {...}, "children": [...]}, or a bare state code');
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PushError("The body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.code === "string") return { code: b.code.trim() };
  if (b.aura !== undefined) {
    if (!isAuraObject(b.aura)) throw new PushError("`aura` must be an object (the aura's Lua table)");
    const children = b.children ?? [];
    if (!Array.isArray(children) || !children.every(isAuraObject)) {
      throw new PushError("`children` must be an array of aura objects");
    }
    return { aura: b.aura, children };
  }
  throw new PushError('Send either "code" (a state code) or "aura" (an aura document)');
}

function isAuraObject(v: unknown): v is AuraDocument {
  return isLuaTable(v as LuaValue) && !Array.isArray(v);
}

/** Validates the input with the addon's own decoder/encoder and returns its state code. */
export function toStateCode(core: AuraCore, input: PushInput): string {
  try {
    if ("code" in input) {
      try {
        core.decode(input.code); // throws for anything the addon wouldn't import
      } catch (e) {
        throw new Error(`Not a valid state code: ${e instanceof Error ? e.message : String(e)}`);
      }
      return input.code;
    }
    const aura = canonicalize(input.aura) as AuraDocument;
    const children = input.children.map((c) => canonicalize(c) as AuraDocument);
    const code = core.encode({ aura, children });
    core.decode(code);
    return code;
  } catch (e) {
    throw new PushError(e instanceof Error ? e.message : String(e), 422);
  }
}
