/**
 * The workspace wire protocol between the page and the server (push API and its event stream), defined once for both.
 *
 * - `POST pushUrl(w)`: a push (agent or page). A page sends `CLIENT_HEADER` so it can skip its own change later.
 * - `GET eventsUrl(w)`: Server-Sent Events. First a `snapshot` event, then a `state` event per change; each carries a
 *   `WorkspaceNotice` (never the code: codes can be megabytes).
 * - `GET snapshotUrl(w, revision?)`: the `WorkspaceSnapshot` (latest, or that recent revision; 404 when no longer kept).
 * - `PUT situationUrl(w)`: an agent sets the situation the game screen shows (open pages take it over); `GET` reads it.
 *
 * The server keeps only the latest few pushes per workspace, in memory: one aura or group each, not a Workspace.
 */
import { isLuaTable, isStateCode, type AuraDocument, type LuaValue } from "@/core";
import { isWagoJsonObject } from "./files";
import { parseWagoLink } from "./wago-link";

/** Header a page sends with its own pushes. HTTP header names are case-insensitive. */
export const CLIENT_HEADER = "x-aura-client";

/**
 * Event names. `situation` carries the situation an agent set for the workspace (`PUT situationUrl(w)`) as JSON
 * (`situationJson`; small, so it travels whole): sent on connect when one is set, then on every change.
 */
export const EVENTS = { snapshot: "snapshot", state: "state", situation: "situation" } as const;

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

/**
 * What a push carries: a state code, an aura document plus a group's descendants, wago JSON (its text, pretty or
 * compact), or a wago link's id (the server fetches the aura's import string from wago).
 */
export type PushInput =
  | { code: string }
  | { aura: AuraDocument; children: AuraDocument[] }
  | { wagoJson: string }
  | { wagoId: string };

const isAuraObject = (v: unknown): v is AuraDocument => isLuaTable(v as LuaValue) && !Array.isArray(v);

/** A wago link (with `bareId`, also a bare id) as a push, or null when the text isn't one; throws for a link we can't import. */
function wagoLinkInput(text: string, bareId = false): PushInput | null {
  const link = parseWagoLink(text, { bareId });
  if (!link) return null;
  if (!link.ok) throw new Error(link.error);
  return { wagoId: link.id };
}

/**
 * Reads a push from a JS value: a string (a state code, wago JSON text, or a wago link), `{code}`,
 * `{aura, children?}`, wago JSON as an object (`{d, c?, ...}`), or `{wago: "<link or id>"}`. Used by the push API
 * (on the parsed body) and the page's `window.auraSimulator.load`. Throws an Error that says what's wrong.
 */
export function readPushInput(value: unknown): PushInput {
  if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("{")) {
      try {
        JSON.parse(text);
      } catch (e) {
        throw new Error(`Not JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
      return { wagoJson: text };
    }
    if (isStateCode(text)) return { code: text };
    return wagoLinkInput(text) ?? { code: text };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("The body must be a JSON object");
  const b = value as Record<string, unknown>;
  if (typeof b.code === "string") return { code: b.code.trim() };
  if (isWagoJsonObject(b)) return { wagoJson: JSON.stringify(b) };
  if (typeof b.wago === "string") {
    const input = wagoLinkInput(b.wago, true);
    if (!input) throw new Error('`wago` must be a wago link (https://wago.io/<id>) or id');
    return input;
  }
  if (b.aura !== undefined) {
    if (!isAuraObject(b.aura)) throw new Error("`aura` must be an object (the aura's Lua table)");
    const children = b.children ?? [];
    if (!Array.isArray(children) || !children.every(isAuraObject)) throw new Error("`children` must be an array of aura objects");
    return { aura: b.aura, children };
  }
  throw new Error('Send wago JSON (the aura in "d"), "code" (a state code), "aura" (an aura document) or "wago" (a wago link)');
}

/** A game's workspace on the server: workspaces are namespaced per game. */
export interface WorkspaceAddress {
  game: string;
  id: string;
}

const base = ({ game, id }: WorkspaceAddress) => `/api/${encodeURIComponent(game)}/workspaces/${encodeURIComponent(id)}`;

export const snapshotUrl = (w: WorkspaceAddress, revision?: number) => (revision ? `${base(w)}?revision=${revision}` : base(w));
export const eventsUrl = (w: WorkspaceAddress) => `${base(w)}/events`;
export const pushUrl = (w: WorkspaceAddress, options: { validate?: boolean } = {}) =>
  options.validate === false ? `${base(w)}/aura?validate=false` : `${base(w)}/aura`;
export const situationUrl = (w: WorkspaceAddress) => `${base(w)}/situation`;
