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

/**
 * A font sample picture's options (`/<game>/fonts/sample` and `GET /api/<game>/fonts/sample.png`): one font of the
 * game's media list drawing `text` at font size `size` (UI units, as `text_fontSize`) with font flags `outline`
 * (`OUTLINE`, `THICKOUTLINE`, `None`, …), at `scale` game pixels per UI unit, on `background` (null: transparent).
 */
export interface FontSampleOptions {
  font: string;
  text: string;
  size: number;
  outline: string;
  /** A drop shadow: units right and up (negative: down), as `text_shadowXOffset`/`text_shadowYOffset`; 0, 0 for none. */
  shadowX: number;
  shadowY: number;
  colour: string;
  scale: number;
  background: string | null;
  ref: string | null;
}

export const DEFAULT_FONT_SAMPLE: Omit<FontSampleOptions, "font"> = {
  text: "Food 12 0:42 Flask",
  size: 12,
  outline: "OUTLINE",
  shadowX: 0,
  shadowY: 0,
  colour: "#ffffff",
  scale: 1,
  background: null,
  ref: null,
};
const MAX_SAMPLE_TEXT = 200;
const MAX_FONT_SIZE = 72;

/** A hex colour option (`#rrggbb[aa]`), or null for "transparent" or nothing. */
function colourOption(params: URLSearchParams, name: string): string | null {
  const value = params.get(name)?.trim() || null;
  if (value === null || value === "transparent") return null;
  if (!HEX_COLOUR.test(value)) throw new RenderOptionsError(`${name} must be "transparent" or a hex colour like 000000 or #202020cc, not "${value}"`);
  return `#${value.replace(/^#/, "")}`;
}

/** The font sample options in a query string; throws `RenderOptionsError` saying what is wrong. */
export function readFontSampleOptions(params: URLSearchParams): FontSampleOptions {
  const font = params.get("font")?.trim();
  if (!font) throw new RenderOptionsError('font is required: a font name of GET /api/<game>/media (e.g. "PT Sans Narrow Bold")');
  const text = params.get("text") ?? DEFAULT_FONT_SAMPLE.text;
  if (text.length === 0 || text.length > MAX_SAMPLE_TEXT) throw new RenderOptionsError(`text must be 1 to ${MAX_SAMPLE_TEXT} characters`);
  return {
    font,
    text,
    size: number(params, "size", DEFAULT_FONT_SAMPLE.size, 0, MAX_FONT_SIZE, true),
    outline: params.get("outline")?.trim() || DEFAULT_FONT_SAMPLE.outline,
    shadowX: number(params, "shadowX", 0, -16, 16, false),
    shadowY: number(params, "shadowY", 0, -16, 16, false),
    colour: colourOption(params, "colour") ?? DEFAULT_FONT_SAMPLE.colour,
    scale: number(params, "scale", DEFAULT_FONT_SAMPLE.scale, 0, MAX_RENDER_SCALE, true),
    background: colourOption(params, "background"),
    ref: params.get("ref")?.trim() || null,
  };
}

/** Absolute address of a font sample page; `origin` like "http://localhost:3000". */
export function buildFontSampleUrl(origin: string, gameId: string, options: FontSampleOptions): string {
  const params = new URLSearchParams({ font: options.font, text: options.text, size: String(options.size), outline: options.outline });
  if (options.shadowX || options.shadowY) {
    params.set("shadowX", String(options.shadowX));
    params.set("shadowY", String(options.shadowY));
  }
  params.set("colour", options.colour);
  params.set("scale", String(options.scale));
  if (options.background) params.set("background", options.background);
  if (options.ref) params.set("ref", options.ref);
  return `${origin.replace(/\/$/, "")}/${gameId}/fonts/sample?${params}`;
}
