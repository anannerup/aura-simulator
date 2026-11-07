/** Mock game screen settings: the window resolution and UI scale the game would run at. */
export interface ScreenSettings {
  /** Game window size in physical pixels. */
  width: number;
  height: number;
  /** The "Use UI Scale" option (CVar `useUiScale`). Off: UIParent has scale 1 and is 768 units high. */
  useUiScale: boolean;
  /** UIParent's scale (CVar `uiScale`, or what an addon such as ElvUI sets with UIParent:SetScale). */
  uiScale: number;
  /** Draw a grid and centre lines over the screen. */
  showGrid: boolean;
  /** Draw the uploaded screenshot behind the screen (when there is one). */
  showBackground: boolean;
  /** How the screen is sized in its pane: all of it (fit), covering the pane (fill), or one CSS pixel per window pixel. */
  zoom: ScreenZoom;
}

export type ScreenZoom = "fit" | "fill" | "actual";
export const SCREEN_ZOOMS: readonly ScreenZoom[] = ["fit", "fill", "actual"];

/**
 * Defaults from the user's own game: Config.wtf has `GxMaximize "1"` (a maximised window) and no resolution, and
 * Logs/gx.log reports the window as 2560x1440. Config.wtf sets neither `useUiScale` nor `uiScale`, but ElvUI sets
 * UIParent's scale to its own `UIScale` = 0.6 (SavedVariables/ElvUI.lua), and that is the scale the auras are drawn at.
 */
export const DEFAULT_SCREEN_SETTINGS: ScreenSettings = {
  width: 2560,
  height: 1440,
  useUiScale: true,
  uiScale: 0.6,
  showGrid: false,
  showBackground: true,
  zoom: "fill",
};

export const RESOLUTION_PRESETS: readonly { width: number; height: number }[] = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1920, height: 1200 },
  { width: 2560, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3440, height: 1440 },
  { width: 3840, height: 2160 },
];

export const MIN_RESOLUTION = 320;
export const MAX_RESOLUTION = 7680;
/** The game's slider goes from 0.64 to 1; addons set UIParent's scale outside that, so allow a wider range. */
export const MIN_UI_SCALE = 0.3;
export const MAX_UI_SCALE = 1.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Turns anything (e.g. parsed localStorage JSON) into valid settings, falling back to the defaults field by field. */
export function sanitizeScreenSettings(input: unknown): ScreenSettings {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_SCREEN_SETTINGS;
  const int = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(clamp(v, MIN_RESOLUTION, MAX_RESOLUTION)) : fallback;
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    width: int(o.width, d.width),
    height: int(o.height, d.height),
    useUiScale: bool(o.useUiScale, d.useUiScale),
    uiScale:
      typeof o.uiScale === "number" && Number.isFinite(o.uiScale) ? clamp(o.uiScale, MIN_UI_SCALE, MAX_UI_SCALE) : d.uiScale,
    showGrid: bool(o.showGrid, d.showGrid),
    showBackground: bool(o.showBackground, d.showBackground),
    zoom: SCREEN_ZOOMS.includes(o.zoom as ScreenZoom) ? (o.zoom as ScreenZoom) : d.zoom,
  };
}
