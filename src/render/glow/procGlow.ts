/**
 * LibCustomGlow ProcGlow (glowType Proc). Uses the atlases UI-HUD-ActionBar-Proc-Start-Flipbook
 * and UI-HUD-ActionBar-Proc-Loop-Flipbook (5 columns × 6 rows, 30 frames each).
 *
 * On WoW Forever: LibCustomGlow has no non-retail branch for it and the atlases exist in the
 * wowf client data (UiTextureAtlas 2476 = FileDataID 5199404, 2048×1024, checked on build
 * 1.60.1.70790), so a Proc glow does draw in game. Musca Auras' options don't offer it, though:
 * Private.glow_types lists only ACShine, Pixel and buttonOverlay, so it only appears in imported
 * auras or ones edited outside the options UI.
 */
import type { TexCoord } from "@/render/textures";

export const PROC_ATLAS_FILE = 5199404;
const ATLAS_W = 2048;
const ATLAS_H = 1024;

/** UiTextureAtlasMember rects (pixels): left, right, top, bottom. */
const START_RECT = [1, 843, 1, 1011] as const;
const LOOP_RECT = [845, 1178, 1, 401] as const;

export const PROC_START_TEXCOORD: TexCoord = [START_RECT[0] / ATLAS_W, START_RECT[1] / ATLAS_W, START_RECT[2] / ATLAS_H, START_RECT[3] / ATLAS_H];
export const PROC_LOOP_TEXCOORD: TexCoord = [LOOP_RECT[0] / ATLAS_W, LOOP_RECT[1] / ATLAS_W, LOOP_RECT[2] / ATLAS_H, LOOP_RECT[3] / ATLAS_H];

export const FLIPBOOK_ROWS = 6;
export const FLIPBOOK_COLUMNS = 5;
export const FLIPBOOK_FRAMES = 30;

/** Start animation: alpha in (0.001 s), flipbook (0.7 s), alpha out (0.001 s). */
export const PROC_START_DURATION = 0.001 + 0.7 + 0.001;

/** FlipBook animation frame (0-based) at `progress` 0..1. */
export function flipbookFrame(progress: number, frames = FLIPBOOK_FRAMES): number {
  return Math.min(frames - 1, Math.max(0, Math.floor(progress * frames)));
}

/** Texcoords of a flipbook cell, relative to the atlas member (0..1 over the member rect). */
export function flipbookCell(frame: number, rows = FLIPBOOK_ROWS, columns = FLIPBOOK_COLUMNS): TexCoord {
  const col = frame % columns;
  const row = Math.floor(frame / columns);
  return [col / columns, (col + 1) / columns, row / rows, (row + 1) / rows];
}

export interface ProcState {
  /** Start flipbook frame, or null when ProcStart is hidden / faded out. */
  startFrame: number | null;
  /** Loop flipbook frame, or null while ProcLoop is hidden. */
  loopFrame: number | null;
}

export function procGlowState(t: number, startAnim: boolean, loopDuration: number): ProcState {
  const dur = loopDuration > 0 ? loopDuration : 0.001;
  if (startAnim) {
    if (t < PROC_START_DURATION) {
      const p = (t - 0.001) / 0.7;
      return { startFrame: flipbookFrame(Math.max(0, p)), loopFrame: null };
    }
    t -= PROC_START_DURATION;
  }
  const p = (t / dur) % 1;
  return { startFrame: null, loopFrame: flipbookFrame(p) };
}

/** ProcGlow frame: parent grown by 20% + offset on each side. */
export function procFrame(width: number, height: number, xOffset: number, yOffset: number) {
  const x = xOffset + width * 0.2;
  const y = yOffset + height * 0.2;
  return { left: -x, top: -y, width: width + 2 * x, height: height + 2 * y };
}

/** ProcStart size: (frame / 42 × 150) / 1.4 per axis, centred on the frame. */
export function procStartSize(frameWidth: number, frameHeight: number) {
  return { width: ((frameWidth / 42) * 150) / 1.4, height: ((frameHeight / 42) * 150) / 1.4 };
}
