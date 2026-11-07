"use client";

import { useId, type ReactNode } from "react";
import type { LuaValue } from "@/core";
import type { Box } from "./bar-geometry";
import { useRegionClock } from "./clock";
import { blendCss, needsShade, ShadeFilter, type Rgba } from "./MappedTexture";
import {
  DEFAULT_STOP_MOTION_TEXTURE,
  numberedFrameFile,
  progressFrame,
  stopMotionSheet,
  tileTexCoord,
  timedFrame,
  type StopMotionSheet,
} from "./stop-motion";
import { regionHost } from "./subregions/host";
import { SubRegions } from "./subregions/SubRegions";
import { color } from "./color";
import { useTextureUrl } from "./textures";
import styles from "./regions.module.css";
import type { RegionProps } from "./region-types";

const num = (v: LuaValue | undefined, fallback?: number) => (typeof v === "number" ? v : fallback);

/** One frame of a stop motion sheet, stretched over `box` (StopMotion.lua SetFrameViaAtlas / SetFrameViaFrames). */
export function StopMotionFrame({
  texture,
  sheet,
  frame,
  box,
  color: rgba,
  desaturate,
  blendMode,
  testId,
  children,
}: {
  texture: string;
  sheet: StopMotionSheet;
  frame: number;
  box: Box;
  color: Rgba;
  desaturate: boolean;
  blendMode: unknown;
  testId?: string;
  children?: ReactNode;
}) {
  const atlas = sheet.rows !== undefined && sheet.columns !== undefined && sheet.rows > 0 && sheet.columns > 0;
  const tex = useTextureUrl(atlas ? texture : numberedFrameFile(texture, frame));
  const filterId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const shade = needsShade(rgba, desaturate);
  let background: Record<string, string> = {};
  if (tex) {
    if (atlas) {
      const [l, r, t, b] = tileTexCoord(frame, sheet.rows!, sheet.columns!, sheet.frameScaleW, sheet.frameScaleH);
      const bw = box.width / (r - l);
      const bh = box.height / (b - t);
      background = {
        backgroundImage: `url(${tex.url})`,
        backgroundSize: `${bw}px ${bh}px`,
        backgroundPosition: `${-l * bw}px ${-t * bh}px`,
      };
    } else background = { backgroundImage: `url(${tex.url})`, backgroundSize: "100% 100%" };
  }
  return (
    <div
      data-testid={testId}
      data-frame={frame}
      data-texture={tex ? "loaded" : "pending"}
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        pointerEvents: "none",
        opacity: rgba[3],
        mixBlendMode: blendCss(blendMode),
      }}
    >
      {shade && <ShadeFilter id={filterId} color={rgba} desaturate={desaturate} />}
      <div style={{ position: "absolute", inset: 0, backgroundRepeat: "no-repeat", filter: shade ? `url(#${filterId})` : undefined, ...background }} />
      {children}
    </div>
  );
}

/** Timed types step with the clock (StopMotion.lua:141-167, region FrameTick). */
export const isTimedStopMotion = (animationType: LuaValue | undefined) =>
  animationType === undefined || animationType === "loop" || animationType === "bounce" || animationType === "once";

/**
 * The stop motion region (RegionTypes/StopMotion.lua): a foreground sheet that loops, bounces or plays once at
 * `frameRate` from when the aura shows, or follows the dynamic trigger's elapsed share in "progress" mode; and an
 * optional background showing one fixed frame (`backgroundPercent`).
 */
export function StopMotionRegion({ aura, state, name, width, height }: RegionProps) {
  const p = state.properties;
  const seconds = useRegionClock();
  const fgTexture = typeof aura.foregroundTexture === "string" ? aura.foregroundTexture : DEFAULT_STOP_MOTION_TEXTURE;
  const custom = (prefix: string) => ({
    customFrames: num(aura[`custom${prefix}Frames`]),
    customRows: num(aura[`custom${prefix}Rows`], 16),
    customColumns: num(aura[`custom${prefix}Columns`], 16),
    customFileWidth: num(aura[`custom${prefix}FileWidth`]),
    customFileHeight: num(aura[`custom${prefix}FileHeight`]),
    customFrameWidth: num(aura[`custom${prefix}FrameWidth`]),
    customFrameHeight: num(aura[`custom${prefix}FrameHeight`]),
  });
  const fgSheet = stopMotionSheet({ texture: fgTexture, startPercent: num(aura.startPercent, 0), endPercent: num(aura.endPercent, 1), ...custom("Foreground") });
  const animationType = aura.animationType ?? "loop";
  const inverse = aura.inverse === true;
  const dynamic = state.dynamic;
  let frame: number;
  if (isTimedStopMotion(animationType)) {
    frame = timedFrame(fgSheet, { seconds, frameRate: num(aura.frameRate, 15), animationType: String(animationType), inverse });
  } else {
    // "progress": 1 - remaining / duration (StopMotion.lua:143-154, 337-354); a static 0 without a timer.
    const progress = dynamic?.remaining !== undefined && dynamic.duration > 0 ? 1 - dynamic.remaining / dynamic.duration : 0;
    frame = progressFrame(fgSheet, progress, inverse);
  }
  const same = aura.sameTexture !== false;
  const bgTexture = same ? fgTexture : typeof aura.backgroundTexture === "string" ? aura.backgroundTexture : DEFAULT_STOP_MOTION_TEXTURE;
  const bgPercent = num(aura.backgroundPercent, 1);
  const bgSheet = stopMotionSheet({ texture: bgTexture, startPercent: bgPercent, endPercent: bgPercent, ...custom(same ? "Foreground" : "Background") });
  const box: Box = { left: 0, top: 0, width, height };
  const background = (
    <>
      {aura.hideBackground === false && (
        <StopMotionFrame
          texture={bgTexture}
          sheet={bgSheet}
          frame={bgSheet.endFrame}
          box={box}
          color={color(p.backgroundColor, [0.5, 0.5, 0.5, 0.5])}
          desaturate={p.desaturateBackground === true}
          blendMode={aura.blendMode}
          testId="stopmotion-background"
        />
      )}
      <StopMotionFrame
        texture={fgTexture}
        sheet={fgSheet}
        frame={frame}
        box={box}
        color={color(p.foregroundColor)}
        desaturate={p.desaturateForeground === true}
        blendMode={aura.blendMode}
        testId="stopmotion-foreground"
      />
    </>
  );
  return (
    <div className={styles.regionFrame} data-animation-type={String(animationType)}>
      <SubRegions aura={aura} state={state} host={regionHost("stopmotion", width, height)} name={name} background={background} />
    </div>
  );
}
