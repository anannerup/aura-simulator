/**
 * The workspace wire protocol between the page and the server (push API and its event stream), defined once for both.
 *
 * - `POST pushUrl(id)`: a push (agent or page). A page sends `CLIENT_HEADER` so it can skip its own change later.
 * - `GET eventsUrl(id)`: Server-Sent Events. First a `snapshot` event, then a `state` event per change; each carries a
 *   `WorkspaceNotice` (never the code: codes can be megabytes).
 * - `GET snapshotUrl(id, revision?)`: the `WorkspaceSnapshot` (latest, or that recent revision; 404 when no longer kept).
 *
 * The server keeps only the latest few pushes per workspace, in memory: one aura or group each, not a Workspace.
 */
import { isLuaTable, type AuraDocument, type LuaValue } from "@/core";

/** Header a page sends with its own pushes. HTTP header names are case-insensitive. */
export const CLIENT_HEADER = "x-aura-client";

export const EVENTS = { snapshot: "snapshot", state: "state" } as const;

export interface WorkspaceSnapshot {
  id: string;
  /** The latest pushed state code, or null when nothing has been pushed since the server started. */
  code: string | null;
  updatedAt: string | null;
  /** Increases with every push; 0 when empty. */
  revision: number;
  /** The page that sent this push (its client header), or null for an agent's push. */
  source: string | null;
}

/** What listeners hear about a push: everything but the code. */
export type WorkspaceNotice = Omit<WorkspaceSnapshot, "code">;

/** What a push carries: a state code, or an aura document plus a group's descendants. */
export type PushInput = { code: string } | { aura: AuraDocument; children: AuraDocument[] };

const isAuraObject = (v: unknown): v is AuraDocument => isLuaTable(v as LuaValue) && !Array.isArray(v);

/**
 * Reads a push from a JS value: a state code string, `{code}`, or `{aura, children?}`. Used by the push API (on the
 * parsed body) and the page's `window.auraSimulator.load`. Throws an Error that says what's wrong.
 */
export function readPushInput(value: unknown): PushInput {
  if (typeof value === "string") return { code: value.trim() };
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("The body must be a JSON object");
  const b = value as Record<string, unknown>;
  if (typeof b.code === "string") return { code: b.code.trim() };
  if (b.aura !== undefined) {
    if (!isAuraObject(b.aura)) throw new Error("`aura` must be an object (the aura's Lua table)");
    const children = b.children ?? [];
    if (!Array.isArray(children) || !children.every(isAuraObject)) throw new Error("`children` must be an array of aura objects");
    return { aura: b.aura, children };
  }
  throw new Error('Send either "code" (a state code) or "aura" (an aura document)');
}

const base = (id: string) => `/api/workspaces/${encodeURIComponent(id)}`;

export const snapshotUrl = (id: string, revision?: number) => (revision ? `${base(id)}?revision=${revision}` : base(id));
export const eventsUrl = (id: string) => `${base(id)}/events`;
export const pushUrl = (id: string, options: { validate?: boolean } = {}) =>
  options.validate === false ? `${base(id)}/aura?validate=false` : `${base(id)}/aura`;
