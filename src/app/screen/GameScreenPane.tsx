"use client";

import { useState, type ReactNode } from "react";
import { ScreenPane, ScreenToolbar, ToolbarSeparator, ToolbarText } from "@/components/shell";
import { GridIcon, IconButton, ImageIcon, Popover, SlidersIcon } from "@/components/ui";
import type { UiParent } from "@/render/screen/geometry";
import { GameScreen } from "@/render/screen/GameScreen";
import type { ScreenZoom } from "@/render/screen/settings";
import { ScreenSettingsPanel } from "./ScreenSettingsPanel";
import { useScreenSettings } from "./screen-settings-store";
import { useScreenshot } from "./screenshot-store";
import styles from "./GameScreenPane.module.css";

/** The game screen's settings and screenshot, shared by the screen and its settings panel. */
export function useGameScreen() {
  const [settings, update] = useScreenSettings();
  const shot = useScreenshot();
  return { settings, update, ...shot };
}

export type GameScreenState = ReturnType<typeof useGameScreen>;

const ZOOMS: { zoom: ScreenZoom; label: string; title: string }[] = [
  { zoom: "fit", label: "Fit", title: "Show the whole game screen" },
  { zoom: "fill", label: "Fill", title: "Fill the stage with the game screen (scroll to see its edges)" },
  { zoom: "actual", label: "1:1", title: "One browser pixel per game pixel" },
];

/**
 * The stage: the mock game screen as large as the centre allows, with a floating toolbar (grid, background,
 * resolution, and a settings popover; screen settings are set once and then left alone, so they stay out of the way).
 * Draws `children` inside UIParent at the configured resolution and scale.
 */
export function GameScreenPane({
  screen,
  notice,
  children,
}: {
  screen: GameScreenState;
  /** A message shown above the screen (e.g. a broken link). */
  notice?: ReactNode;
  children: (ui: UiParent) => ReactNode;
}) {
  const { settings, update, screenshot } = screen;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const backgroundOn = settings.showBackground && !!screenshot;
  return (
    <ScreenPane
      banner={notice}
      toolbar={
        <ScreenToolbar label="Game screen">
          <IconButton
            label={settings.showGrid ? "Hide grid" : "Show grid"}
            icon={<GridIcon />}
            size="sm"
            pressed={settings.showGrid}
            onClick={() => update({ showGrid: !settings.showGrid })}
          />
          {screenshot ? (
            <IconButton
              label={backgroundOn ? "Hide background image" : "Show background image"}
              icon={<ImageIcon />}
              size="sm"
              pressed={backgroundOn}
              onClick={() => update({ showBackground: !settings.showBackground })}
            />
          ) : (
            <IconButton label="Add a background image" icon={<ImageIcon />} size="sm" onClick={screen.pickFile} />
          )}
          <ToolbarSeparator />
          <div role="radiogroup" aria-label="Zoom" className={styles.zoom}>
            {ZOOMS.map((z) => (
              <button
                key={z.zoom}
                type="button"
                role="radio"
                aria-checked={settings.zoom === z.zoom}
                title={z.title}
                className={styles.zoomButton}
                onClick={() => update({ zoom: z.zoom })}
              >
                {z.label}
              </button>
            ))}
          </div>
          <ToolbarSeparator />
          <ToolbarText>
            {settings.width} × {settings.height}
            <span className={styles.dim}> · UI scale {settings.useUiScale ? settings.uiScale.toFixed(2) : "off"}</span>
          </ToolbarText>
          <Popover
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            label="Game screen settings"
            align="end"
            trigger={(props) => (
              <IconButton label="Screen settings" icon={<SlidersIcon />} size="sm" pressed={settingsOpen} {...props} />
            )}
          >
            <div className={styles.popoverHead}>
              <h2 className={styles.popoverTitle}>Game screen</h2>
              <p className={styles.popoverHint}>Match your game once; it is remembered in this browser.</p>
            </div>
            <ScreenSettingsPanel
              settings={settings}
              onChange={update}
              screenshot={screenshot}
              screenshotError={screen.error}
              onChooseScreenshot={screen.choose}
              onClearScreenshot={screen.clear}
            />
          </Popover>
        </ScreenToolbar>
      }
    >
      <GameScreen settings={settings} backgroundUrl={screenshot?.url} fill>
        {children}
      </GameScreen>
    </ScreenPane>
  );
}
