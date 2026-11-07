/**
 * The render page's address (`/<game>/render?w=<workspace>&aura=<id>&scale=…`) and the screenshot endpoint's
 * (`/api/<game>/workspaces/<id>/screenshot.png?aura=…`): which aura of a workspace to draw, and how. Both read the
 * same options, so an agent can open the page to see what the PNG will be. Pure, shared by page and server.
 */
import { DEFAULT_WORKSPACE_ID, isWorkspaceId } from "./address";

export interface RenderOptions {
  /** The aura (or group) to draw, by id; null: the workspace's latest push (its top-level aura). */
  aura: string | null;
  /** Game pixels per UI unit (one unit of the aura's own size and offsets): 1 draws a 64-unit icon 64 px wide. */
  scale: number;
  /** UI units of empty space around the aura's bounds (glows and shadows reach outside them). */
  padding: number;
  /** The background as a CSS colour (`#rrggbb` or `#rrggbbaa`); null: transparent. */
  background: string | null;
  /** The situation as JSON text (`readSituation`); null: the workspace's (as an agent set it, else the default). */
  situation: string | null;
  /** The addon version; null: the newest release. */
  ref: string | null;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = { aura: null, scale: 1, padding: 0, background: null, situation: null, ref: null };

export const MAX_RENDER_SCALE = 8;
export const MAX_RENDER_PADDING = 512;
/** Largest picture side in pixels. */
export const MAX_RENDER_PIXELS = 4096;
const MAX_SITUATION_CHARS = 16 * 1024;

export class RenderOptionsError extends Error {}

const HEX_COLOUR = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function number(params: URLSearchParams, name: string, fallback: number, min: number, max: number, minExclusive: boolean): number {
  const raw = params.get(name);
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  const low = minExclusive ? n > min : n >= min;
  if (!Number.isFinite(n) || !low || n > max) {
    throw new RenderOptionsError(`${name} must be a number ${minExclusive ? "above" : "from"} ${min} up to ${max}, not "${raw}"`);
  }
  return n;
}

/** The options in a query string; throws `RenderOptionsError` saying what is wrong. */
export function readRenderOptions(params: URLSearchParams): RenderOptions {
  const background = params.get("background")?.trim() || null;
  if (background !== null && background !== "transparent" && !HEX_COLOUR.test(background)) {
    throw new RenderOptionsError(`background must be "transparent" or a hex colour like 000000 or #202020cc, not "${background}"`);
  }
  const situation = params.get("situation")?.trim() || null;
  if (situation && situation.length > MAX_SITUATION_CHARS) throw new RenderOptionsError("situation is too long");
  return {
    aura: params.get("aura") || null,
    scale: number(params, "scale", DEFAULT_RENDER_OPTIONS.scale, 0, MAX_RENDER_SCALE, true),
    padding: number(params, "padding", DEFAULT_RENDER_OPTIONS.padding, 0, MAX_RENDER_PADDING, false),
    background: background === null || background === "transparent" ? null : `#${background.replace(/^#/, "")}`,
    situation,
    ref: params.get("ref")?.trim() || null,
  };
}

/** The workspace `w` names (default "default"); throws `RenderOptionsError` for one that isn't a workspace id. */
export function readRenderWorkspace(params: URLSearchParams): string {
  const w = params.get("w");
  if (w === null || w === "") return DEFAULT_WORKSPACE_ID;
  if (!isWorkspaceId(w)) throw new RenderOptionsError("w: workspace IDs are 1-64 of A-Z a-z 0-9 _ -");
  return w;
}

/** The query string of options (no leading `?`), leaving out defaults. */
export function renderQuery(options: Partial<RenderOptions>): URLSearchParams {
  const params = new URLSearchParams();
  const o = { ...DEFAULT_RENDER_OPTIONS, ...options };
  if (o.aura) params.set("aura", o.aura);
  if (o.scale !== DEFAULT_RENDER_OPTIONS.scale) params.set("scale", String(o.scale));
  if (o.padding !== DEFAULT_RENDER_OPTIONS.padding) params.set("padding", String(o.padding));
  if (o.background) params.set("background", o.background);
  if (o.situation) params.set("situation", o.situation);
  if (o.ref) params.set("ref", o.ref);
  return params;
}

/** Absolute address of the render page for a workspace's aura; `origin` like "http://localhost:3000". */
export function buildRenderUrl(origin: string, gameId: string, workspaceId: string, options: Partial<RenderOptions>): string {
  const params = renderQuery(options);
  params.set("w", workspaceId);
  return `${origin.replace(/\/$/, "")}/${gameId}/render?${params}`;
}
