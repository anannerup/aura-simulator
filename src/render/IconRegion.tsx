"use client";

import type { CSSProperties } from "react";
import { isLuaTable, type AuraDocument, type LuaValue } from "@/core";
import { useWowFont } from "./fonts";
import { iconHost } from "./subregions/host";
import { SubRegions } from "./subregions/SubRegions";
import { formatTime } from "./text-format";
import { useAuraIconUrl } from "./textures";
import styles from "./regions.module.css";
import type { RegionProps } from "./region-types";

export function rgba(value: LuaValue | undefined, fallback: [number, number, number, number] = [1, 1, 1, 1]): [number, number, number, number] {
  const c = isLuaTable(value) && Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((i) => (typeof c[i] === "number" ? Math.min(1, Math.max(0, c[i] as number)) : fallback[i])) as [
    number,
    number,
    number,
    number,
  ];
}

export const css = ([r, g, b, a]: [number, number, number, number]) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

/**
 * The icon region (RegionTypes/Icon.lua): the texture with zoom, desaturation and colour, the cooldown
 * swipe, its sub-regions in draw order (texts, border, glow) and the frozen marker.
 */
export function IconRegion({ aura, state, name, width, height }: RegionProps) {
  const p = state.properties;
  const desaturate = p.desaturate === true;
  // Icon.lua:347-378 UpdateTexCoords: cropped to the aspect ratio when keepAspectRatio is on.
  const aspect = aura.keepAspectRatio === true && height > 0 ? width / height : 1;
  const dynamic = state.dynamic;
  const showCooldown =
    p.cooldown !== false && !state.missing && dynamic?.remaining !== undefined && dynamic.duration > 0;

  // The icon texture and the cooldown belong to the region's own frame: drawn at the subbackground position.
  const background = (
    <>
      <div className={styles.iconClip}>
        <IconTexture aura={aura} name={name} zoom={num(p.zoom, 0)} aspect={aspect} desaturate={desaturate} tint={rgba(p.color)} />
      </div>
      {showCooldown && (
        <CooldownSwipe
          remaining={dynamic!.remaining!}
          duration={dynamic!.duration}
          reverse={p.inverse === true}
          swipe={p.cooldownSwipe !== false}
          edge={p.cooldownEdge === true}
          numbers={p.cooldownTextDisabled !== true}
          size={Math.min(width, height)}
        />
      )}
    </>
  );

  return (
    <div
      className={styles.iconFrame}
      data-desaturated={desaturate ? "true" : "false"}
      data-missing={state.missing ? "true" : "false"}
    >
      <SubRegions aura={aura} state={state} host={iconHost(width, height)} name={name} background={background} />
    </div>
  );
}

/**
 * The game's Cooldown frame (CooldownFrameTemplate): a dark swipe (0,0,0,0.8) over the part of the
 * timer that is still to run, shrinking clockwise from 12 o'clock; reversed (Icon.lua:430-441, `inverse`)
 * it darkens the elapsed part instead. The edge is a bright line on the boundary. Countdown numbers show
 * unless "Hide Timer Text" (cooldownTextDisabled) is on (Icon.lua:461-490), assuming the game's
 * "Show numbers for cooldowns" option is on.
 */
function CooldownSwipe({ remaining, duration, reverse, swipe, edge, numbers, size }: {
  remaining: number;
  duration: number;
  reverse: boolean;
  swipe: boolean;
  edge: boolean;
  numbers: boolean;
  size: number;
}) {
  const font = useWowFont(undefined);
  const elapsed = Math.min(1, Math.max(0, 1 - remaining / duration));
  const angle = elapsed * 360;
  const dark = "rgba(0, 0, 0, 0.8)";
  const background = reverse
    ? `conic-gradient(${dark} 0deg ${angle}deg, transparent ${angle}deg 360deg)`
    : `conic-gradient(transparent 0deg ${angle}deg, ${dark} ${angle}deg 360deg)`;
  return (
    <div className={styles.cooldown} data-testid="cooldown" data-reverse={reverse ? "true" : "false"} data-progress={elapsed.toFixed(3)}>
      {swipe && <div className={styles.swipe} style={{ background }} data-testid="cooldown-swipe" />}
      {edge && elapsed > 0 && elapsed < 1 && (
        <div className={styles.edge} style={{ transform: `rotate(${angle}deg)` }} data-testid="cooldown-edge" />
      )}
      {numbers && (
        <span className={styles.countdown} style={{ fontSize: Math.max(10, Math.round(size * 0.4)), fontFamily: font.family }} data-testid="cooldown-text">
          {formatTime(remaining, { format: 1, threshold: 0 })}
        </span>
      )}
    </div>
  );
}

/**
 * An aura's icon texture inside a clipping box: zoomed in by texWidth = 1 - zoom/2 (Icon.lua:347-378,
 * AuraBar.lua:1388-1404), cropped to `aspect`, desaturated and tinted (SetVertexColor multiplies the colour).
 */
export function IconTexture({ aura, name, zoom, aspect = 1, desaturate, tint }: {
  aura: AuraDocument;
  name: string;
  zoom: number;
  aspect?: number;
  desaturate: boolean;
  tint: readonly number[];
}) {
  const src = useAuraIconUrl(aura) ?? undefined;
  const visible = 1 - 0.5 * Math.min(1, Math.max(0, zoom));
  const fx = visible * (aspect < 1 ? aspect : 1);
  const fy = visible * (aspect > 1 ? 1 / aspect : 1);
  const style: CSSProperties = {
    position: "absolute",
    maxWidth: "none",
    width: `${100 / fx}%`,
    height: `${100 / fy}%`,
    left: `${(-(1 - fx) / 2 / fx) * 100}%`,
    top: `${(-(1 - fy) / 2 / fy) * 100}%`,
    filter: desaturate ? "grayscale(1)" : undefined,
    opacity: tint[3],
  };
  const tinted = tint[0] < 1 || tint[1] < 1 || tint[2] < 1;
  return (
    <>
      {/* Blizzard art comes from Wowhead's image server at runtime; next/image would proxy it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.icon} src={src} alt={name} style={style} draggable={false} />
      {tinted && <div className={styles.tint} style={{ background: css([tint[0], tint[1], tint[2], 1]), opacity: tint[3] }} data-testid="icon-tint" />}
    </>
  );
}
