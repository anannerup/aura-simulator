"use client";

import { num, type AuraDocument, type LuaValue } from "@/core";
import {
  barLayout,
  barProgress,
  barTextureTurn,
  foregroundBox,
  orientationOf,
  sparkCenter,
  sparkTextureTurn,
  sparkVisible,
  type Box,
} from "./bar-geometry";
import { IconTexture } from "./IconRegion";
import { CASTING_BAR_SPARK, statusBarTexture, textureSourceOf } from "./media";
import { fullBox, type SubRegionHost } from "./subregions/host";
import { SubRegions } from "./subregions/SubRegions";
import { color, rgbaCss } from "./color";
import { TurnedTexture } from "./TurnedTexture";
import styles from "./regions.module.css";
import type { RegionProps } from "./region-types";


/**
 * The aura bar region (RegionTypes/AuraBar.lua): a status bar texture over a background of the same texture,
 * filled from the dynamic trigger's timer in one of four orientations, with optional spark, icon, gradient and
 * its sub-regions (texts, border, ticks, glow) in the game's draw order.
 */
export function AuraBarRegion({ aura, state, name, width, height }: RegionProps) {
  const p = state.properties;
  const orientation = orientationOf(p.orientation);
  const showIcon = p.icon === true;
  const layout = barLayout({ width, height, orientation, icon: showIcon, iconSide: aura.icon_side === "LEFT" ? "LEFT" : "RIGHT" });
  const bar = layout.bar;
  const inverse = p.inverse === true;
  const dynamic = state.dynamic;
  const progress = barProgress({
    remaining: dynamic?.remaining,
    duration: dynamic?.duration ?? 0,
    inverse,
    missing: state.missing,
    adjustedMin: aura.adjustedMin,
    adjustedMax: aura.adjustedMax,
  });
  const fg = foregroundBox(bar, orientation, progress.progress);
  const texture = statusBarTexture(aura);
  const turn = barTextureTurn(orientation);
  const barColor = color(p.barColor, [1, 0, 0, 1]);
  const bgColor = color(p.backgroundColor, [0, 0, 0, 0.5]);
  const spark = sparkCenter(bar, orientation, progress.progress, num(aura.sparkOffsetX, 0), num(aura.sparkOffsetY, 0));
  const sparkW = num(p.sparkWidth, 10);
  const sparkH = num(p.sparkHeight, 30);
  const sparkBox: Box = { left: spark.x - sparkW / 2, top: spark.y - sparkH / 2, width: sparkW, height: sparkH };
  const fgArea: Box = fg ?? { ...bar, width: isHorizontal(orientation) ? 0 : bar.width, height: isHorizontal(orientation) ? bar.height : 0 };
  const icon = layout.icon;

  const host: SubRegionHost = {
    regionType: "aurabar",
    width,
    height,
    area(anchorArea) {
      switch (anchorArea) {
        case "icon":
          return icon ?? { left: 0, top: 0, width: 0, height: 0 };
        case "fg":
          return fgArea;
        case "bg":
          return bar;
        default:
          return fullBox(width, height);
      }
    },
    // AuraBar.lua:900-935: points are on the bar; ICON_ on the icon; INNER_ inset by 2; SPARK the spark's centre.
    point(anchorPoint) {
      if (anchorPoint.startsWith("ICON_")) return { box: icon ?? { left: 0, top: 0, width: 0, height: 0 }, point: anchorPoint.slice(5), dx: 0, dy: 0 };
      if (anchorPoint === "SPARK") return { box: { left: spark.x, top: spark.y, width: 0, height: 0 }, point: "CENTER", dx: 0, dy: 0 };
      if (anchorPoint.startsWith("INNER_")) {
        const point = anchorPoint.slice(6);
        const dx = point.includes("LEFT") ? 2 : point.includes("RIGHT") ? -2 : 0;
        const dy = point.includes("TOP") ? -2 : point.includes("BOTTOM") ? 2 : 0;
        return { box: bar, point, dx, dy };
      }
      return { box: bar, point: anchorPoint, dx: 0, dy: 0 };
    },
    bar: { bar, orientation, inverse, min: progress.min, max: progress.max, remaining: dynamic?.remaining },
  };

  // The background texture is the region's own (subbackground position, AuraBar.lua:1237).
  const background = (
    <TurnedTexture source={texture} box={bar} turn={turn} color={bgColor} fallback={bgColor} testId="bar-background" />
  );

  const gradient = p.enableGradient === true;
  const foreground = (
    <>
      <div
        className={styles.barFill}
        style={fg ? { left: fg.left, top: fg.top, width: fg.width, height: fg.height } : { display: "none", left: bar.left, top: bar.top, width: 0, height: 0 }}
        data-testid="bar-foreground"
        data-progress={progress.progress.toFixed(4)}
      >
        <div style={{ position: "absolute", left: bar.left - (fg?.left ?? bar.left), top: bar.top - (fg?.top ?? bar.top), width: bar.width, height: bar.height, isolation: gradient ? "isolate" : undefined }}>
          <TurnedTexture
            source={texture}
            box={fullBox(bar.width, bar.height)}
            turn={turn}
            color={gradient ? [1, 1, 1, barColor[3]] : barColor}
            fallback={gradient ? [1, 1, 1, barColor[3]] : barColor}
          />
          {gradient && <GradientTint orientation={aura.gradientOrientation} from={barColor} to={color(p.barColor2, [1, 1, 0, 1])} />}
        </div>
      </div>
      {sparkVisible(aura.spark === true, aura.sparkHidden, progress.progress) && (
        <TurnedTexture
          source={textureSourceOf(aura.sparkTexture) ?? CASTING_BAR_SPARK}
          box={sparkBox}
          turn={sparkTextureTurn(orientation, aura.sparkRotationMode, aura.sparkRotation, aura.sparkMirror === true)}
          color={color(p.sparkColor)}
          desaturate={aura.sparkDesaturate === true}
          blend={String(aura.sparkBlendMode ?? "ADD")}
          testId="bar-spark"
        />
      )}
      {icon && <BarIcon aura={aura} name={name} box={icon} zoom={num(aura.zoom, 0)} desaturate={p.desaturate === true} tint={color(p.icon_color)} />}
    </>
  );

  return (
    <div className={styles.regionFrame} data-orientation={orientation} data-missing={state.missing ? "true" : "false"}>
      <SubRegions aura={aura} state={state} host={host} name={name} background={background} foreground={foreground} />
    </div>
  );
}

const isHorizontal = (o: string) => o === "HORIZONTAL" || o === "HORIZONTAL_INVERSE";

/** SetGradient (AuraBar.lua:630-639) multiplies the bar texture by a colour ramp; VERTICAL runs bottom to top. */
function GradientTint({ orientation, from, to }: { orientation: LuaValue | undefined; from: readonly number[]; to: readonly number[] }) {
  const solid = (c: readonly number[]) => rgbaCss([c[0], c[1], c[2], 1]);
  const direction = orientation === "VERTICAL" ? "to top" : "to right";
  return (
    <div
      data-testid="bar-gradient"
      style={{ position: "absolute", inset: 0, mixBlendMode: "multiply", background: `linear-gradient(${direction}, ${solid(from)}, ${solid(to)})` }}
    />
  );
}

/** The bar's icon (AuraBar.lua:1388-1404): square, zoomed, desaturated, tinted. */
function BarIcon({ aura, name, box, zoom, desaturate, tint }: { aura: AuraDocument; name: string; box: Box; zoom: number; desaturate: boolean; tint: readonly number[] }) {
  return (
    <div className={styles.barIcon} style={{ left: box.left, top: box.top, width: box.width, height: box.height }} data-testid="bar-icon" data-desaturated={desaturate ? "true" : "false"}>
      <IconTexture aura={aura} name={name} zoom={zoom} desaturate={desaturate} tint={tint} />
    </div>
  );
}
