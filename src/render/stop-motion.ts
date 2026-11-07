/**
 * Stop motion frame maths (BaseRegions/StopMotion.lua): which sheet layout a texture has, which frame shows at a
 * time or progress, and the texcoords of that frame. Pure; no React.
 */
import { normalizeTexturePath } from "./textures/paths";

/**
 * WeakAuras.StopMotion.texture_data (Types.lua:4159-4165): the addon ships one sheet. Other sheets (the
 * WeakAurasStopMotion addon) aren't installed on Forever.
 */
export const STOP_MOTION_TEXTURE_DATA: Readonly<Record<string, { count: number; rows: number; columns: number }>> = {
  [normalizeTexturePath("Interface\\AddOns\\WeakAuras\\Media\\Textures\\stopmotion")]: { count: 64, rows: 8, columns: 8 },
};

export const DEFAULT_STOP_MOTION_TEXTURE = "Interface\\AddOns\\WeakAuras\\Media\\Textures\\stopmotion";

export interface StopMotionOptions {
  texture: string;
  startPercent?: number;
  endPercent?: number;
  customFrames?: number;
  customRows?: number;
  customColumns?: number;
  customFileWidth?: number;
  customFileHeight?: number;
  customFrameWidth?: number;
  customFrameHeight?: number;
}

export interface StopMotionSheet {
  /** 1-based frame range. */
  startFrame: number;
  endFrame: number;
  /** A frame grid (atlas); without it the frames are numbered files (`texture` .. "%03d"). */
  rows?: number;
  columns?: number;
  /** Share of the file the frames cover (frameWidth·columns / fileWidth), 1 when unknown. */
  frameScaleW: number;
  frameScaleH: number;
}

/** StopMotion.lua:357-428 modify: the sheet from texture_data, the file name pattern, or the custom settings. */
export function stopMotionSheet(o: StopMotionOptions): StopMotionSheet {
  const frameRange = (lastFrame: number) => ({
    startFrame: Math.floor((o.startPercent ?? 0) * lastFrame) + 1,
    endFrame: Math.floor((o.endPercent ?? 1) * lastFrame) + 1,
  });
  const scale = (frame?: number, count?: number, file?: number) =>
    file !== undefined && frame !== undefined && count !== undefined && file > 0 && frame > 0 ? (frame * count) / file : 1;
  const known = STOP_MOTION_TEXTURE_DATA[normalizeTexturePath(o.texture)];
  if (known) return { ...frameRange(known.count - 1), rows: known.rows, columns: known.columns, frameScaleW: 1, frameScaleH: 1 };
  // "%.x(%d+)y(%d+)f(%d+)%.[tb][gl][ap]" on the lower-cased name: rows, columns, frames.
  const simple = /\.x(\d+)y(\d+)f(\d+)\.[tb][gl][ap]/.exec(o.texture.toLowerCase());
  if (simple) {
    return { ...frameRange(Number(simple[3]) - 1), rows: Number(simple[1]), columns: Number(simple[2]), frameScaleW: 1, frameScaleH: 1 };
  }
  // "...x(rows)y(columns)f(frames)w(frameWidth)h(frameHeight)W(fileWidth)H(fileHeight)" (case sensitive).
  const sized = /\.x(\d+)y(\d+)f(\d+)w(\d+)h(\d+)W(\d+)H(\d+)\.[tb][gl][ap]/.exec(o.texture);
  if (sized) {
    const [rows, columns, frames, fw, fh, W, H] = sized.slice(1).map(Number);
    return { ...frameRange(frames - 1), rows, columns, frameScaleW: scale(fw, columns, W), frameScaleH: scale(fh, rows, H) };
  }
  const rows = o.customRows;
  const columns = o.customColumns;
  return {
    ...frameRange((o.customFrames ?? 256) - 1),
    rows,
    columns,
    // StopMotion.lua:181-191 SetFrameViaAtlas.
    frameScaleW: scale(o.customFrameWidth, columns, o.customFileWidth),
    frameScaleH: scale(o.customFrameHeight, rows, o.customFileHeight),
  };
}

export type StopMotionAnimation = "loop" | "bounce" | "once" | "progress" | "background";

function ordered(sheet: StopMotionSheet, inverse: boolean) {
  let { startFrame, endFrame } = sheet;
  if (endFrame >= startFrame) return { startFrame, endFrame, frames: endFrame - startFrame + 1, inverse };
  [startFrame, endFrame] = [endFrame, startFrame];
  return { startFrame, endFrame, frames: endFrame - startFrame + 1, inverse: !inverse };
}

const clampFrame = (frame: number, start: number, end: number) => Math.max(start, Math.min(end, frame));

/**
 * StopMotion.lua:229-277 TimedUpdate: the frame `seconds` after the region was shown (PreShow sets the start
 * time), stepping `frameRate` frames a second.
 */
export function timedFrame(sheet: StopMotionSheet, o: { seconds: number; frameRate?: number; animationType: string; inverse: boolean }): number {
  const current = Math.floor(o.seconds * (o.frameRate ?? 15));
  const { startFrame, endFrame, frames, inverse } = ordered(sheet, o.inverse);
  let frame = 0;
  if (o.animationType === "loop") frame = (current % frames) + startFrame;
  else if (o.animationType === "bounce") {
    const direction = Math.floor(current / frames) % 2;
    frame = direction === 0 ? (current % frames) + startFrame : endFrame - (current % frames);
  } else if (o.animationType === "once") frame = Math.min(current + startFrame, endFrame);
  if (inverse) frame = endFrame - frame + startFrame;
  return clampFrame(frame, startFrame, endFrame);
}

/** StopMotion.lua:280-306 SetProgress. */
export function progressFrame(sheet: StopMotionSheet, progress: number, inverseDirection: boolean): number {
  const { startFrame, endFrame, frames, inverse } = ordered(sheet, inverseDirection);
  let frame = Math.floor((frames - 1) * progress) + startFrame;
  if (inverse) frame = endFrame - frame + startFrame;
  return clampFrame(frame, startFrame, endFrame);
}

/** StopMotion.lua:71-85 setTile: SetTexCoord(left, right, top, bottom) of a 1-based frame. */
export function tileTexCoord(frame: number, rows: number, columns: number, frameScaleW = 1, frameScaleH = 1): [number, number, number, number] {
  const f = frame - 1;
  const row = Math.floor(f / columns);
  const column = f % columns;
  const dx = frameScaleW / columns;
  const dy = frameScaleH / rows;
  return [dx * column, dx * column + dx, dy * row, dy * row + dy];
}

/** Numbered-frame sheets: the file of a frame (StopMotion.lua:200-202, `texture .. format("%03d", frame)`). */
export const numberedFrameFile = (texture: string, frame: number) => texture + String(frame).padStart(3, "0");

/** Timed types step with the clock (StopMotion.lua:141-167, region FrameTick). */
export const isTimedStopMotion = (animationType: unknown) =>
  animationType === undefined || animationType === "loop" || animationType === "bounce" || animationType === "once";

/**
 * The frame a stop motion shows: the timed types step at `frameRate` from when the aura shows; "progress" follows the
 * dynamic trigger's elapsed share, 1 - remaining / duration (StopMotion.lua:143-154, 337-354), a static 0 without a timer.
 */
export function stopMotionFrame(
  sheet: StopMotionSheet,
  o: { animationType: unknown; frameRate: number; inverse: boolean; seconds: number; timer?: { remaining?: number; duration: number } },
): number {
  const type = o.animationType ?? "loop";
  if (isTimedStopMotion(type)) return timedFrame(sheet, { seconds: o.seconds, frameRate: o.frameRate, animationType: String(type), inverse: o.inverse });
  const t = o.timer;
  return progressFrame(sheet, t && t.remaining !== undefined && t.duration > 0 ? 1 - t.remaining / t.duration : 0, o.inverse);
}
