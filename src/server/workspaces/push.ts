import { canonicalize, type AuraCore, type AuraDocument, type ValidationResult } from "@/core";
import { buildPageUrl, readPushInput, type PushInput } from "@/workspace";
import { validateCode } from "../validation";
import { getServerAuraCore } from "./aura-core";
import { getWorkspaceHub } from "./hub";

export type { PushInput };

/** A request the caller got wrong; `status` is the HTTP status to answer with. */
export class PushError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * Largest push body, in bytes. Auras can be megabytes (long custom text, big groups). Next.js puts no limit on
 * route handler bodies while the app has no proxy (`proxy.ts`); if one is added, raise
 * `experimental.proxyClientMaxBodySize` (10 MB by default) to match.
 */
export const MAX_PUSH_BYTES = 32 * 1024 * 1024;

/**
 * Reads a request body as UTF-8 text, stopping with 413 as soon as it passes `maxBytes` (checked against
 * Content-Length first, then while streaming), so an oversized body is never buffered whole.
 */
export async function readBodyText(request: Request, maxBytes = MAX_PUSH_BYTES): Promise<string> {
  const tooLarge = () => new PushError(`Body too large (over ${Math.round(maxBytes / 1024 / 1024)} MB)`, 413);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8");
  const parts: string[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());
  return parts.join("");
}

/**
 * Reads a push body: JSON `{code}` or `{aura, children?}`, or a bare state code as text
 * (so `curl --data-binary @aura.txt` works).
 */
export function parsePushBody(text: string, contentType: string | null): PushInput {
  const trimmed = text.trim();
  if (!contentType?.includes("json") && trimmed.startsWith("!WA:")) return { code: trimmed };
  let body: unknown;
  try {
    body = JSON.parse(trimmed);
  } catch {
    throw new PushError('Send JSON {"code": "!WA:2!..."} or {"aura": {...}, "children": [...]}, or a bare state code');
  }
  try {
    return readPushInput(body);
  } catch (e) {
    throw new PushError(e instanceof Error ? e.message : String(e));
  }
}

/** Checks the input with the addon's own decoder/encoder and returns its state code. */
export function toStateCode(core: AuraCore, input: PushInput): string {
  const fail = (prefix: string, e: unknown) => new PushError(`${prefix}${e instanceof Error ? e.message : String(e)}`, 422);
  if ("code" in input) {
    try {
      core.decode(input.code); // throws for anything the addon wouldn't import
    } catch (e) {
      throw fail("Not a valid state code: ", e);
    }
    return input.code;
  }
  try {
    const aura = canonicalize(input.aura) as AuraDocument;
    const children = input.children.map((c) => canonicalize(c) as AuraDocument);
    const code = core.encode({ aura, children });
    core.decode(code);
    return code;
  } catch (e) {
    throw fail("", e);
  }
}

export interface PushResult {
  workspace: string;
  code: string;
  /** The page that follows this workspace. */
  url: string;
  updatedAt: string;
  revision: number;
  /** The addon's own checks and combat warnings for the pushed aura (null when skipped). Export is never blocked. */
  validation: ValidationResult | null;
}

export interface PushOptions {
  /** The page that sent it (its client header), so it can skip its own change in the event stream. */
  source?: string | null;
  /** False skips the addon validation in the answer (the page validates itself). Default true. */
  validate?: boolean;
}

/** Checks and encodes a push, records it for the workspace and notifies open pages. */
export async function pushToWorkspace(
  workspaceId: string,
  input: PushInput,
  origin: string,
  options: PushOptions = {},
): Promise<PushResult> {
  const core = await getServerAuraCore();
  const code = toStateCode(core, input);
  const snap = getWorkspaceHub().set(workspaceId, code, options.source ?? null);
  return {
    workspace: workspaceId,
    code,
    url: buildPageUrl(origin, workspaceId),
    updatedAt: snap.updatedAt!,
    revision: snap.revision,
    validation: options.validate === false ? null : await validateCode(code, { core }),
  };
}
