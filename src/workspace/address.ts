/**
 * The page address names the game (`/<game>`) and only the workspace the page follows: `?w=<workspace id>` (left out
 * for "default"). Auras never travel in the address: they can be megabytes, so they move as files (see `files.ts`),
 * over the push API, or through the clipboard. The page rewrites the address to `buildSearch`, which drops every other
 * parameter.
 */

export const DEFAULT_WORKSPACE_ID = "default";

const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isWorkspaceId(id: string): boolean {
  return WORKSPACE_ID.test(id);
}

/** The workspace `w` names in a query string (with or without the leading `?`). */
export function parseWorkspaceId(search: string): string {
  const w = new URLSearchParams(search).get("w");
  return w && isWorkspaceId(w) ? w : DEFAULT_WORKSPACE_ID;
}

/** The query string for a workspace (with leading `?`, or "" for the default workspace). */
export function buildSearch(workspaceId: string): string {
  return workspaceId === DEFAULT_WORKSPACE_ID ? "" : `?w=${encodeURIComponent(workspaceId)}`;
}

/** Absolute page address of a game's workspace; `origin` like "http://localhost:3000". */
export function buildPageUrl(origin: string, gameId: string, workspaceId: string): string {
  return `${origin.replace(/\/$/, "")}/${gameId}${buildSearch(workspaceId)}`;
}
