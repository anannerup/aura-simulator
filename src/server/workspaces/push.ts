import {
  canonicalize,
  DEFAULT_SITUATION,
  fromWagoJson,
  isStateCode,
  previewSituation,
  WagoJsonError,
  type AuraCore,
  type AuraDocument,
  type SituationPreview,
  type ValidationResult,
} from "@/core";
import { buildPageUrl, readPushInput, type PushInput } from "@/workspace";
import { getServerAuraCore } from "@/server/addon/core";
import type { ServerGame } from "@/server/game";
import { fetchWagoCode, WagoFetchError } from "@/server/wago";
import { getWorkspaceHub } from "./hub";
import { errorMessage } from "@/lib/errors";

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
 * Reads a push body: wago JSON (pretty or compact, the aura in `d`), JSON `{code}`, `{aura, children?}` or
 * `{wago: "<link>"}`, or as plain text a bare state code or wago link (so `curl --data-binary @aura.txt` works).
 */
export function parsePushBody(text: string, contentType: string | null): PushInput {
  const trimmed = text.trim();
  if (!contentType?.includes("json") && !trimmed.startsWith("{")) {
    try {
      const input = readPushInput(trimmed);
      if (!("code" in input) || isStateCode(input.code)) return input;
    } catch (e) {
      throw new PushError(errorMessage(e));
    }
  }
  let body: unknown;
  try {
    body = JSON.parse(trimmed);
  } catch (e) {
    throw new PushError(
      `Not JSON (${errorMessage(e)}). Send wago JSON, {"code": "!WA:2!..."}, {"aura": {...}, "children": [...]} or ` +
        '{"wago": "https://wago.io/<id>"}, or a bare state code or wago link as text',
    );
  }
  try {
    return readPushInput(body);
  } catch (e) {
    throw new PushError(errorMessage(e));
  }
}

/** A wago link's push as its import string, fetched from wago; any other input as it is. */
export async function resolveWago(input: PushInput, fetchCode = fetchWagoCode): Promise<PushInput> {
  if (!("wagoId" in input)) return input;
  try {
    return { code: await fetchCode(input.wagoId) };
  } catch (e) {
    throw new PushError(errorMessage(e), e instanceof WagoFetchError ? e.status : 502);
  }
}

/** Checks the input with the addon's own decoder/encoder and returns its state code. */
export function toStateCode(core: AuraCore, input: PushInput): string {
  const fail = (prefix: string, e: unknown) => new PushError(`${prefix}${errorMessage(e)}`, 422);
  if ("code" in input) {
    try {
      core.decode(input.code); // throws for anything the addon wouldn't import
    } catch (e) {
      throw fail("Not a valid state code: ", e);
    }
    return input.code;
  }
  if ("wagoId" in input) throw new PushError("A wago link's import string must be fetched first (resolveWago)", 500);
  if ("wagoJson" in input) {
    let state;
    try {
      state = fromWagoJson(input.wagoJson);
    } catch (e) {
      throw fail(e instanceof WagoJsonError ? "" : "Not wago JSON of an aura: ", e);
    }
    try {
      const code = core.encode(state);
      core.decode(code);
      return code;
    } catch (e) {
      throw fail("", e);
    }
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
  /** What each display shows in the workspace's situation (the one an agent set, else the default). */
  preview: SituationPreview;
}

export interface PushOptions {
  /** The page that sent it (its client header), so it can skip its own change in the event stream. */
  source?: string | null;
  /** False skips the addon validation in the answer (the page validates itself). Default true. */
  validate?: boolean;
  /** Addon version (a release) to encode and validate with. Default: the server's (resolveServerRef). */
  ref?: string | null;
}

/** Checks and encodes a push with the game's addon, records it for the game's workspace and notifies open pages. */
export async function pushToWorkspace(
  server: ServerGame,
  workspaceId: string,
  input: PushInput,
  origin: string,
  options: PushOptions = {},
): Promise<PushResult> {
  const core = await getServerAuraCore(server, options.ref);
  const code = toStateCode(core, await resolveWago(input));
  // As the game's import: the addon's own import dialog decides (e.g. it refuses an aura made with a newer version).
  const check = await core.importCheck(core.decode(code));
  if (!check.importable) throw new PushError(check.message, 422);
  const hub = getWorkspaceHub(server.game.id);
  const snap = hub.set(workspaceId, code, options.source ?? null);
  const state = core.decode(code);
  const validation = options.validate === false ? null : await core.validate(state);
  return {
    workspace: workspaceId,
    code,
    url: buildPageUrl(origin, server.game.id, workspaceId),
    updatedAt: snap.updatedAt!,
    revision: snap.revision,
    validation,
    preview: previewSituation(state, hub.getSituation(workspaceId) ?? DEFAULT_SITUATION, server.game.id, validation),
  };
}
