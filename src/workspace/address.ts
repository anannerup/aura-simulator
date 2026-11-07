/**
 * The page address names only the workspace the page follows: `/?w=<workspace id>` (left out for "default").
 * Auras never travel in the address: they can be megabytes, so they move as files (see `files.ts`), over the
 * push API, or through the clipboard.
 *
 * Old links from before that decision may carry `?code=<state code>`: `parseAddress` reports it so the page can
 * import it once. The page then rewrites the address to `buildSearch`, which drops every other parameter.
 */

export const DEFAULT_WORKSPACE_ID = "default";

const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isWorkspaceId(id: string): boolean {
  return WORKSPACE_ID.test(id);
}

export interface AddressState {
  workspaceId: string;
  /** A legacy `?code=` state code to import once, if any. */
  legacyCode: string | null;
}

/** Reads `w` (and the legacy `code`) from a query string (with or without the leading `?`). */
export function parseAddress(search: string): AddressState {
  const params = new URLSearchParams(search);
  const w = params.get("w");
  // URLSearchParams turns "+" into a space; state codes never contain either.
  const legacyCode = params.get("code")?.replace(/ /g, "+").trim() || null;
  return { workspaceId: w && isWorkspaceId(w) ? w : DEFAULT_WORKSPACE_ID, legacyCode };
}

/** The query string for a workspace (with leading `?`, or "" for the default workspace). */
export function buildSearch(workspaceId: string): string {
  return workspaceId === DEFAULT_WORKSPACE_ID ? "" : `?w=${encodeURIComponent(workspaceId)}`;
}

/** Absolute page address of a workspace; `origin` like "http://localhost:3000". */
export function buildPageUrl(origin: string, workspaceId: string): string {
  return `${origin.replace(/\/$/, "")}/${buildSearch(workspaceId)}`;
}
