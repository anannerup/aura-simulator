/**
 * The page address holds the workspace's current state code, like a chess FEN:
 *
 * - `/?code=<state code>`          the code itself, while it fits (see MAX_ADDRESS_CODE_LENGTH)
 * - `/?s=<short id>`               a short link stored on the server, for longer codes
 * - `w=<workspace id>` (optional)  the workspace the page follows for agent pushes; absent means "default"
 *
 * `(` and `)` (part of the state code alphabet) are percent-encoded so chat apps and Markdown don't cut
 * links at a closing parenthesis; `!` and `:` stay readable.
 */

export const DEFAULT_WORKSPACE_ID = "default";

/** Longest encoded `code=` value put in the address (keeps whole URLs safely under ~2000 characters). */
export const MAX_ADDRESS_CODE_LENGTH = 1800;

const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SHORT_ID = /^[A-Za-z0-9]{4,32}$/;

export function isWorkspaceId(id: string): boolean {
  return WORKSPACE_ID.test(id);
}

export function isShortId(id: string): boolean {
  return SHORT_ID.test(id);
}

export interface AddressState {
  workspaceId: string;
  /** A state code in the address, if any. */
  code: string | null;
  /** A short-link ID in the address, if any (only when there's no `code`). */
  shortId: string | null;
}

/** Reads `w`, `code` and `s` from a query string (with or without the leading `?`). */
export function parseAddress(search: string): AddressState {
  const params = new URLSearchParams(search);
  const w = params.get("w");
  // URLSearchParams turns "+" into a space; state codes never contain either.
  const code = params.get("code")?.replace(/ /g, "+").trim() || null;
  const s = params.get("s");
  return {
    workspaceId: w && isWorkspaceId(w) ? w : DEFAULT_WORKSPACE_ID,
    code,
    shortId: !code && s && isShortId(s) ? s : null,
  };
}

export function encodeCodeParam(code: string): string {
  return encodeURIComponent(code).replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/%3A/gi, ":");
}

/** Whether a code is too long for the address and needs a short link. */
export function needsShortLink(code: string): boolean {
  return encodeCodeParam(code).length > MAX_ADDRESS_CODE_LENGTH;
}

export interface AddressTarget {
  workspaceId: string;
  code?: string | null;
  shortId?: string | null;
}

/** Builds the query string (with leading `?`, or "" when there's nothing to say). */
export function buildSearch(target: AddressTarget): string {
  const parts: string[] = [];
  if (target.workspaceId !== DEFAULT_WORKSPACE_ID) parts.push(`w=${encodeURIComponent(target.workspaceId)}`);
  if (target.shortId) parts.push(`s=${encodeURIComponent(target.shortId)}`);
  else if (target.code) parts.push(`code=${encodeCodeParam(target.code)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Absolute page address; `origin` like "http://localhost:3000". */
export function buildPageUrl(origin: string, target: AddressTarget): string {
  return `${origin.replace(/\/$/, "")}/${buildSearch(target)}`;
}
