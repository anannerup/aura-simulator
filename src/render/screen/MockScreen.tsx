"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { fitScale, uiParent, type UiParent } from "./geometry";
import type { ScreenSettings } from "./settings";
import styles from "./MockScreen.module.css";

export interface MockScreenProps {
  settings: ScreenSettings;
  /** Object URL of a screenshot drawn behind the UI, stretched over the whole window (1:1 at the same resolution). */
  backgroundUrl?: string | null;
  /** Largest height the screen may take, as a fraction of the browser window's height. */
  maxViewportHeight?: number;
  /** Fit into the container's own width and height instead (the container must have a definite height). */
  fill?: boolean;
  /** Draws the UI inside UIParent; everything inside is laid out in UIParent units. */
  children: (ui: UiParent) => ReactNode;
}

/** Grid spacing in UIParent units. */
const GRID_STEP = 50;

/**
 * The game window, scaled to fit the browser area with its aspect ratio kept. Its child layer is UIParent: sized in
 * UI units and scaled by CSS so that one unit takes as many CSS pixels as it takes window pixels in game, times the fit.
 */
export function MockScreen({ settings, backgroundUrl, maxViewportHeight = 0.7, fill = false, children }: MockScreenProps) {
  const container = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () =>
      setArea({
        width: el.clientWidth,
        height: fill ? Math.max(50, el.clientHeight) : Math.max(100, window.innerHeight * maxViewportHeight),
      });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [maxViewportHeight, fill]);

  const ui = uiParent(settings);
  // In the stage (`fill`), the zoom setting picks the size; "fill" and "actual" may overflow, and the stage scrolls.
  const zoom = fill ? (settings.zoom ?? "fit") : "fit";
  const fit =
    zoom === "fill"
      ? Math.max(area.width / settings.width, area.height / settings.height)
      : zoom === "actual"
        ? 1
        : fitScale(settings, area);
  const cssPerUnit = fit * ui.pixelsPerUnit;
  const display = { width: settings.width * fit, height: settings.height * fit };
  const showBackground = settings.showBackground && !!backgroundUrl;

  // Zoomed in, start at the screen's centre, where auras usually are; keep it there when the stage resizes.
  useLayoutEffect(() => {
    const el = container.current;
    if (!el || !fill) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [fill, zoom, fit]);

  const layerStyle = {
    width: ui.width,
    height: ui.height,
    transform: `scale(${cssPerUnit})`,
    "--css-per-unit": cssPerUnit,
  } as CSSProperties;

  return (
    <div ref={container} className={fill ? `${styles.fit} ${styles.fill}` : styles.fit} data-zoom={zoom}>
      <div
        className={styles.window}
        style={display}
        data-testid="mock-screen"
        data-window={`${settings.width}x${settings.height}`}
        data-ui-width={ui.width}
        data-ui-height={ui.height}
      >
        {/* The background sits inside the UI layer so additively blended art (sparks, glows) adds onto it: the
            layer's transform makes it an isolated group whose own backdrop would otherwise be empty. */}
        <div className={styles.uiParent} style={layerStyle}>
          {showBackground && (
            // A local object URL; next/image can't optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.background} src={backgroundUrl} alt="Screenshot background" data-testid="screen-background" />
          )}
          {children(ui)}
        </div>
        {settings.showGrid && <Grid width={display.width} height={display.height} step={GRID_STEP * cssPerUnit} />}
      </div>
    </div>
  );
}

function Grid({ width, height, step }: { width: number; height: number; step: number }) {
  const cx = width / 2;
  const cy = height / 2;
  const lines: ReactNode[] = [];
  if (step >= 4) {
    for (let d = step; cx - d >= 0 || cy - d >= 0; d += step) {
      for (const x of [cx - d, cx + d]) if (x >= 0 && x <= width) lines.push(<line key={`x${x}`} x1={x} x2={x} y1={0} y2={height} />);
      for (const y of [cy - d, cy + d]) if (y >= 0 && y <= height) lines.push(<line key={`y${y}`} x1={0} x2={width} y1={y} y2={y} />);
    }
  }
  return (
    <svg className={styles.grid} width={width} height={height} data-testid="screen-grid" aria-hidden>
      <g className={styles.gridLines}>{lines}</g>
      <g className={styles.centreLines}>
        <line x1={cx} x2={cx} y1={0} y2={height} />
        <line x1={0} x2={width} y1={cy} y2={cy} />
      </g>
    </svg>
  );
}
