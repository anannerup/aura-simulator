import type { CSSProperties } from "react";
import { getField, isLuaTable, type AuraDocument, type LuaTable, type LuaValue } from "@/core";
import { anchorFraction } from "./anchor";
import type { AuraRenderState } from "./conditions";
import { frozenMarkerSize } from "./conditions/forever-rules";
import { formatSubText, formatTime } from "./text-format";
import { useAuraIconUrl } from "./textures";
import styles from "./AuraPreview.module.css";

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
 * swipe, sub-region texts, the glow hook and the frozen marker.
 */
export function IconRegion({ aura, state, name, width, height }: { aura: AuraDocument; state: AuraRenderState; name: string; width: number; height: number }) {
  const p = state.properties;
  const desaturate = p.desaturate === true;
  const color = rgba(p.color);
  const zoom = Math.min(1, Math.max(0, num(p.zoom, 0)));
  // Icon.lua:347-378 UpdateTexCoords: visible texture share = 1 - zoom/2, cropped to the aspect ratio when
  // keepAspectRatio is on.
  const texWidth = 1 - 0.5 * zoom;
  const aspect = aura.keepAspectRatio === true && height > 0 ? width / height : 1;
  const fx = texWidth * (aspect < 1 ? aspect : 1);
  const fy = texWidth * (aspect > 1 ? 1 / aspect : 1);
  const imgStyle: CSSProperties = {
    width: `${100 / fx}%`,
    height: `${100 / fy}%`,
    left: `${(-(1 - fx) / 2 / fx) * 100}%`,
    top: `${(-(1 - fy) / 2 / fy) * 100}%`,
    filter: desaturate ? "grayscale(1)" : undefined,
    opacity: color[3],
  };
  const iconSrc = useAuraIconUrl(aura) ?? undefined;
  const tinted = color[0] < 1 || color[1] < 1 || color[2] < 1;
  const dynamic = state.dynamic;
  const showCooldown =
    p.cooldown !== false && !state.missing && dynamic?.remaining !== undefined && dynamic.duration > 0;

  const states = new Map<number, (typeof state.triggers)[number] | undefined>(state.triggers.map((t) => [t.index, t]));
  states.set(0, dynamic);

  return (
    <div
      className={styles.iconFrame}
      data-desaturated={desaturate ? "true" : "false"}
      data-missing={state.missing ? "true" : "false"}
    >
      <div className={styles.iconClip}>
        {/* Blizzard art comes from Wowhead's image server at runtime; next/image would proxy it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.icon} src={iconSrc} alt={name} style={imgStyle} draggable={false} />
        {tinted && (
          // SetVertexColor multiplies the texture colour.
          <div className={styles.tint} style={{ background: css([color[0], color[1], color[2], 1]), opacity: color[3] }} data-testid="icon-tint" />
        )}
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
      {state.glows.map((glow) => (
        // Glow hook (ticket 08): `glow.visible` is sub.N.glow after conditions; `glow.element` its settings.
        // The <Glow> renderer replaces this placeholder.
        <div key={glow.index} className={styles.glowHook} data-subregion="subglow" data-index={glow.index} data-glow={glow.visible ? "on" : "off"} />
      ))}
      {list(aura.subRegions).map((element, i) =>
        isLuaTable(element) && getField(element, "type") === "subtext" ? (
          <SubText
            key={i}
            element={element}
            position={i + 1}
            state={state}
            text={formatSubText(element, { states, name, stackText: state.nativeStackText[i + 1] })}
            width={width}
            height={height}
          />
        ) : null,
      )}
      {state.frozenMarker && <FrozenMarker size={frozenMarkerSize(width, height)} />}
    </div>
  );
}

function list(value: LuaValue | undefined): LuaValue[] {
  return Array.isArray(value) ? value : [];
}

/**
 * The game's Cooldown frame (CooldownFrameTemplate): a dark swipe (0,0,0,0.8) over the part of the
 * timer that is still to run, shrinking clockwise from 12 o'clock; reversed (Icon.lua:430-441, `inverse`)
 * it darkens the elapsed part instead. The edge is a bright line on the boundary. Countdown numbers show
 * unless "Hide Timer Text" (cooldownTextDisabled) is on (Icon.lua:461-490), assuming the game's
 * "Show numbers for cooldowns" option is on.
 */
export function CooldownSwipe({ remaining, duration, reverse, swipe, edge, numbers, size }: {
  remaining: number;
  duration: number;
  reverse: boolean;
  swipe: boolean;
  edge: boolean;
  numbers: boolean;
  size: number;
}) {
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
        <span className={styles.countdown} style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }} data-testid="cooldown-text">
          {formatTime(remaining, { format: 1, threshold: 0 })}
        </span>
      )}
    </div>
  );
}

const FONT_FAMILIES: Record<string, string> = {
  "Friz Quadrata TT": '"Friz Quadrata TT", "Friz Quadrata", Georgia, serif',
  "Arial Narrow": '"Arial Narrow", Arial, sans-serif',
  Morpheus: "Morpheus, Georgia, serif",
  Skurri: "Skurri, Georgia, serif",
};

/**
 * A text sub-region on an icon (SubRegionTypes/SubText.lua). Anchors: INNER_ points use a box 80% of the
 * icon, OUTER_ points 110% (Icon.lua:220-241); AUTO self point per resolveSelfPoint (SubText.lua:510-537).
 */
function SubText({ element, position, state, text, width, height }: {
  element: LuaTable;
  position: number;
  state: AuraRenderState;
  text: string;
  width: number;
  height: number;
}) {
  const p = state.properties;
  const g = (k: string) => getField(element, k);
  const visible = p[`sub.${position}.text_visible`] !== false;
  const color = rgba(p[`sub.${position}.text_color`] ?? g("text_color"));
  const alpha = num(p[`sub.${position}.text_alpha`], 1);
  let anchor = typeof g("anchor_point") === "string" ? String(g("anchor_point")) : "CENTER";
  let box = { left: 0, top: 0, width, height };
  let selfPoint = typeof g("text_selfPoint") === "string" ? String(g("text_selfPoint")) : "AUTO";
  if (anchor.startsWith("INNER_")) {
    anchor = anchor.slice(6);
    box = { left: 0.1 * width, top: 0.1 * height, width: 0.8 * width, height: 0.8 * height };
    if (selfPoint === "AUTO") selfPoint = anchor;
  } else if (anchor.startsWith("OUTER_")) {
    anchor = anchor.slice(6);
    box = { left: -0.05 * width, top: -0.05 * height, width: 1.1 * width, height: 1.1 * height };
    if (selfPoint === "AUTO") selfPoint = INVERSE_POINTS[anchor] ?? "CENTER";
  } else if (selfPoint === "AUTO") selfPoint = "CENTER";
  const [ax, ay] = anchorFraction(anchor);
  const [sx, sy] = anchorFraction(selfPoint);
  const x = num(g("text_anchorXOffset") ?? g("anchorXOffset"), 0);
  const y = num(g("text_anchorYOffset") ?? g("anchorYOffset"), 0);
  const outline = String(g("text_fontType") ?? "OUTLINE");
  const shadow = rgba(g("text_shadowColor"), [0, 0, 0, 1]);
  const shadows: string[] = [];
  if (outline === "OUTLINE" || outline === "THICKOUTLINE") {
    const w = outline === "THICKOUTLINE" ? 2 : 1;
    for (const [dx, dy] of [[-w, 0], [w, 0], [0, -w], [0, w], [-w, -w], [w, w], [-w, w], [w, -w]]) shadows.push(`${dx}px ${dy}px 0 #000`);
  }
  const shx = num(g("text_shadowXOffset"), 0);
  const shy = num(g("text_shadowYOffset"), 0);
  if (shx !== 0 || shy !== 0) shadows.push(`${shx}px ${-shy}px 0 ${css(shadow)}`);
  const font = String(g("text_font") ?? "Friz Quadrata TT");
  const style: CSSProperties = {
    left: box.left + box.width * ax + x,
    top: box.top + box.height * ay - y,
    transform: `translate(${-sx * 100}%, ${-sy * 100}%)`,
    color: css(color),
    opacity: visible ? alpha : 0,
    fontSize: num(p[`sub.${position}.text_fontSize`] ?? g("text_fontSize"), 12),
    fontFamily: FONT_FAMILIES[font] ?? `"${font}", ${FONT_FAMILIES["Friz Quadrata TT"]}`,
    textShadow: shadows.join(", ") || undefined,
    textAlign: (String(g("text_justify") ?? "CENTER").toLowerCase() as CSSProperties["textAlign"]) ?? "center",
  };
  return (
    <span className={styles.subText} style={style} data-subregion="subtext" data-index={position} data-visible={visible ? "true" : "false"}>
      {text}
    </span>
  );
}

const INVERSE_POINTS: Record<string, string> = {
  TOPLEFT: "BOTTOMRIGHT",
  TOP: "BOTTOM",
  TOPRIGHT: "BOTTOMLEFT",
  LEFT: "RIGHT",
  CENTER: "CENTER",
  RIGHT: "LEFT",
  BOTTOMLEFT: "TOPRIGHT",
  BOTTOM: "TOP",
  BOTTOMRIGHT: "TOPLEFT",
};

/** FrozenMarker.lua:30-38: a padlock at the region's top right, offset (2, 2). */
function FrozenMarker({ size }: { size: number }) {
  return (
    <svg className={styles.frozen} width={size} height={size} viewBox="0 0 16 16" style={{ right: -2, top: -2 }} data-testid="frozen-marker" aria-label="Frozen value">
      <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="#d9b45a" strokeWidth="1.8" />
      <rect x="2.5" y="7" width="11" height="8" rx="1.5" fill="#d9b45a" stroke="#4a3510" strokeWidth="0.8" />
      <circle cx="8" cy="10.6" r="1.2" fill="#4a3510" />
    </svg>
  );
}
