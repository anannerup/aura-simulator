"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { rgbaCss, type Rgba } from "../color";
import { texCoordBackground, useTextureUrl, type TexCoord } from "../textures";
import {
  ANIM_IN_DURATION,
  BUTTON_GLOW_PARTS,
  BUTTON_GLOW_TEXCOORDS,
  ICON_ALERT,
  ICON_ALERT_ANTS,
  antsFrameAt,
  antsTexCoord,
  buttonGlowFrame,
  buttonGlowOutState,
  buttonGlowState,
  createAntsAnimator,
  type ButtonGlowState,
} from "./buttonGlow";
import { autoCastSparkles, autoCastTimers, ITEM_SOCKETS, SHINE_TEXCOORD } from "./autoCast";
import {
  glowDrawable,
  glowParams,
  offsetFrameRect,
  type AutoCastParams,
  type ButtonGlowParams,
  type GlowOptions,
  type GlowType,
  type PixelGlowParams,
  type ProcGlowParams,
} from "./params";
import { bandClipPath, PIXEL_BORDER_COLOR, pixelGlowLines, pixelProgress } from "./pixelGlow";
import {
  PROC_ATLAS_FILE,
  PROC_LOOP_TEXCOORD,
  PROC_START_TEXCOORD,
  flipbookCell,
  procFrame,
  procGlowState,
  procStartSize,
} from "./procGlow";
import { useGlowClock } from "./useGlowClock";

export interface GlowProps {
  /** Glow sub-region glowType. */
  type: GlowType;
  /** Glow sub-region fields (missing ones take Glow.lua's defaults). */
  options?: Partial<GlowOptions>;
  /** Size of the region the glow wraps (icon, or bar for aura bars), CSS px at UI scale 1. */
  width: number;
  height: number;
  /** The sub-region's `glow` flag. Turning it off plays the button glow's fade-out. Default true. */
  visible?: boolean;
  /** Freeze at this many seconds after the glow started (instead of animating). */
  time?: number;
  className?: string;
  style?: CSSProperties;
}

const abs: CSSProperties = { position: "absolute", pointerEvents: "none" };

function px(n: number) {
  return `${n}px`;
}

function tintOf(color: Rgba | null): readonly [number, number, number] | undefined {
  return color ? [color[0], color[1], color[2]] : undefined;
}

/**
 * A LibCustomGlow glow drawn around a `width`×`height` box, positioned at that box's top-left.
 * Put it in a `position: relative` container on top of the icon/bar. It deliberately creates no
 * stacking context so additive (ADD) parts blend with what is underneath.
 */
export function Glow({ type, options = {}, width, height, visible = true, time, className, style }: GlowProps) {
  const params = glowParams(type, options, width, height);
  if (!glowDrawable(width, height)) return null;
  const props = { width, height, visible, time };
  return (
    <div
      className={className}
      data-glow-type={type}
      style={{ ...abs, left: 0, top: 0, width: px(width), height: px(height), overflow: "visible", ...style }}
    >
      {params.type === "buttonOverlay" && <ButtonGlow key={type} params={params} {...props} />}
      {visible && params.type === "Pixel" && <PixelGlow key={type} params={params} {...props} />}
      {visible && params.type === "ACShine" && <AutoCastGlow key={type} params={params} {...props} />}
      {visible && params.type === "Proc" && <ProcGlow key={type} params={params} {...props} />}
    </div>
  );
}

interface RendererProps<P> {
  params: P;
  width: number;
  height: number;
  visible: boolean;
  time?: number;
}

// ---------------------------------------------------------------- ButtonGlow

type Phase = { kind: "in" | "out" | "hidden"; start: number };

function ButtonGlow({ params, width, height, visible, time }: RendererProps<ButtonGlowParams>) {
  const color = params.color;
  const variant = { desaturate: !!color, tint: tintOf(color) };
  const alert = useTextureUrl(ICON_ALERT, variant);
  const ants = useTextureUrl(ICON_ALERT_ANTS, variant);
  const frame = buttonGlowFrame(width, height);
  const refs = useRef<Partial<Record<string, HTMLDivElement | null>>>({});
  const phase = useRef<Phase>({ kind: "in", start: 0 });
  const wantVisible = useRef(visible);
  const antsAnim = useRef(createAntsAnimator(params.throttle));
  const throttle = params.throttle;

  useEffect(() => {
    wantVisible.current = visible;
  }, [visible]);
  useEffect(() => {
    antsAnim.current = createAntsAnimator(throttle);
  }, [throttle]);

  const apply = (state: ButtonGlowState | null, antsFrame: number) => {
    for (const part of BUTTON_GLOW_PARTS) {
      const el = refs.current[part];
      if (!el) continue;
      const s = state?.[part];
      if (!s || s.alpha <= 0) {
        el.style.opacity = "0";
        continue;
      }
      const w = frame.width * s.size;
      const h = frame.height * s.size;
      const coord: TexCoord = part === "ants" ? antsTexCoord(antsFrame) : BUTTON_GLOW_TEXCOORDS[part];
      const bg = texCoordBackground(coord, w, h);
      el.style.left = px((frame.width - w) / 2);
      el.style.top = px((frame.height - h) / 2);
      el.style.width = px(w);
      el.style.height = px(h);
      el.style.backgroundSize = bg.backgroundSize;
      el.style.backgroundPosition = bg.backgroundPosition;
      el.style.transform = s.scale === 1 ? "" : `scale(${s.scale})`;
      el.style.opacity = String(Math.min(1, s.alpha));
    }
    if (refs.current.root) refs.current.root.dataset.antsFrame = String(antsFrame);
  };

  useGlowClock(
    (t, elapsed) => {
      const a = color ? color[3] : null;
      if (time !== undefined) {
        apply(visible ? buttonGlowState(t, a) : null, antsFrameAt(t, throttle));
        return;
      }
      const p = phase.current;
      if (wantVisible.current && p.kind !== "in") phase.current = { kind: "in", start: t };
      if (!wantVisible.current && p.kind === "in") {
        // ButtonGlow_Stop: during animIn it is released at once, otherwise animOut plays.
        phase.current = { kind: t - p.start < ANIM_IN_DURATION ? "hidden" : "out", start: t };
      }
      const cur = phase.current;
      const antsFrame = antsAnim.current.step(elapsed);
      if (cur.kind === "in") apply(buttonGlowState(t - cur.start, a), antsFrame);
      else if (cur.kind === "out") apply(buttonGlowOutState(t - cur.start, a), antsFrame);
      else apply(null, antsFrame);
    },
    "buttonOverlay",
    time,
  );

  // Draw layers (BACKGROUND spark < ARTWORK glows < OVERLAY ants) follow from DOM order.
  const part = (url: string | undefined): CSSProperties => ({
    ...abs,
    opacity: 0,
    backgroundImage: url ? `url(${url})` : undefined,
    backgroundRepeat: "no-repeat",
    transformOrigin: "50% 50%",
  });

  return (
    <div
      ref={(el) => {
        refs.current.root = el;
      }}
      data-glow-part="frame"
      data-ready={alert && ants ? "true" : "false"}
      style={{ ...abs, left: px(frame.left), top: px(frame.top), width: px(frame.width), height: px(frame.height) }}
    >
      {BUTTON_GLOW_PARTS.map((name) => (
        <div
          key={name}
          data-glow-part={name}
          ref={(el) => {
            refs.current[name] = el;
          }}
          style={part(name === "ants" ? ants?.url : alert?.url)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- PixelGlow

function PixelGlow({ params, width, height, time }: RendererProps<PixelGlowParams>) {
  const frame = offsetFrameRect(width, height, params.xOffset, params.yOffset);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const th = params.thickness;

  useGlowClock(
    (t) => {
      const rects = pixelGlowLines(pixelProgress(t, params.period), frame.width, frame.height, th, params.length, params.lines);
      rects.forEach((r, i) => {
        const el = lineRefs.current[i];
        if (!el) return;
        const visible = r.width > 0 && r.height > 0;
        el.style.display = visible ? "" : "none";
        el.style.left = px(r.left);
        el.style.top = px(r.top);
        el.style.width = px(Math.max(0, r.width));
        el.style.height = px(Math.max(0, r.height));
      });
    },
    "Pixel",
    time,
  );

  return (
    <div data-glow-part="frame" data-ready="true" style={{ ...abs, left: px(frame.left), top: px(frame.top), width: px(frame.width), height: px(frame.height) }}>
      {params.border && (
        <div
          data-glow-part="border"
          style={{ ...abs, inset: 0, background: PIXEL_BORDER_COLOR, clipPath: bandClipPath(frame.width, frame.height, th + 1) }}
        />
      )}
      <div style={{ ...abs, inset: 0, clipPath: bandClipPath(frame.width, frame.height, th) }}>
        {Array.from({ length: params.lines }, (_, i) => (
          <div
            key={i}
            data-glow-part="line"
            ref={(el) => {
              lineRefs.current[i] = el;
            }}
            style={{ ...abs, background: rgbaCss(params.color) }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- AutoCastGlow

function AutoCastGlow({ params, width, height, time }: RendererProps<AutoCastParams>) {
  const frame = offsetFrameRect(width, height, params.xOffset, params.yOffset);
  const shine = useTextureUrl(ITEM_SOCKETS, { desaturate: true, tint: tintOf(params.color), crop: SHINE_TEXCOORD });
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const count = params.particles * 4;

  useGlowClock(
    (t) => {
      const sparkles = autoCastSparkles(autoCastTimers(t, params.period), frame.width, frame.height, params.particles, params.scale);
      sparkles.forEach((s, i) => {
        const el = refs.current[i];
        if (!el) return;
        el.style.left = px(s.x - s.size / 2);
        el.style.top = px(s.y - s.size / 2);
        el.style.width = px(s.size);
        el.style.height = px(s.size);
      });
    },
    "ACShine",
    time,
  );

  return (
    <div data-glow-part="frame" data-ready={shine ? "true" : "false"} style={{ ...abs, left: px(frame.left), top: px(frame.top), width: px(frame.width), height: px(frame.height) }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          data-glow-part="sparkle"
          ref={(el) => {
            refs.current[i] = el;
          }}
          style={{
            ...abs,
            backgroundImage: shine ? `url(${shine.url})` : undefined,
            backgroundSize: "100% 100%",
            mixBlendMode: "plus-lighter",
            opacity: params.color[3],
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- ProcGlow

function ProcGlow({ params, width, height, time }: RendererProps<ProcGlowParams>) {
  const frame = procFrame(width, height, params.xOffset, params.yOffset);
  const color = params.color;
  const variant = { desaturate: !!color, tint: tintOf(color) };
  const start = useTextureUrl(PROC_ATLAS_FILE, { ...variant, crop: PROC_START_TEXCOORD });
  const loop = useTextureUrl(PROC_ATLAS_FILE, { ...variant, crop: PROC_LOOP_TEXCOORD });
  const startRef = useRef<HTMLDivElement | null>(null);
  const loopRef = useRef<HTMLDivElement | null>(null);
  const startSize = procStartSize(frame.width, frame.height);
  const alpha = color ? String(color[3]) : "1";

  useGlowClock(
    (t) => {
      const s = procGlowState(t, params.startAnim, params.duration);
      const startEl = startRef.current;
      const loopEl = loopRef.current;
      if (startEl) {
        startEl.style.opacity = s.startFrame === null ? "0" : alpha;
        if (s.startFrame !== null) {
          const bg = texCoordBackground(flipbookCell(s.startFrame), startSize.width, startSize.height);
          startEl.style.backgroundSize = bg.backgroundSize;
          startEl.style.backgroundPosition = bg.backgroundPosition;
          startEl.dataset.frame = String(s.startFrame);
        }
      }
      if (loopEl) {
        loopEl.style.opacity = s.loopFrame === null ? "0" : alpha;
        if (s.loopFrame !== null) {
          const bg = texCoordBackground(flipbookCell(s.loopFrame), frame.width, frame.height);
          loopEl.style.backgroundSize = bg.backgroundSize;
          loopEl.style.backgroundPosition = bg.backgroundPosition;
          loopEl.dataset.frame = String(s.loopFrame);
        }
      }
    },
    "Proc",
    time,
  );

  return (
    <div data-glow-part="frame" data-ready={start && loop ? "true" : "false"} style={{ ...abs, left: px(frame.left), top: px(frame.top), width: px(frame.width), height: px(frame.height) }}>
      <div
        data-glow-part="procLoop"
        ref={loopRef}
        style={{ ...abs, inset: 0, opacity: 0, backgroundImage: loop ? `url(${loop.url})` : undefined, backgroundRepeat: "no-repeat" }}
      />
      <div
        data-glow-part="procStart"
        ref={startRef}
        style={{
          ...abs,
          left: px((frame.width - startSize.width) / 2),
          top: px((frame.height - startSize.height) / 2),
          width: px(startSize.width),
          height: px(startSize.height),
          opacity: 0,
          backgroundImage: start ? `url(${start.url})` : undefined,
          backgroundRepeat: "no-repeat",
          mixBlendMode: "plus-lighter",
        }}
      />
    </div>
  );
}
