"use client";

import { useId, useState, type ReactNode } from "react";
import { Stage, StageToolbar, ToolbarSeparator, ToolbarText } from "@/components/shell";
import { GridIcon, IconButton, ImageIcon, Popover, SlidersIcon } from "@/components/ui";
import type { UiParent } from "@/render/screen/geometry";
import { MockScreen } from "@/render/screen/MockScreen";
import { ScreenSettingsPanel } from "./ScreenSettingsPanel";
import { useScreenSettings } from "./screen-settings-store";
import { useScreenshot } from "./screenshot-store";
import styles from "./GameScreen.module.css";

/** The mock screen's settings and screenshot, shared by the screen and its settings panel. */
export function useGameScreen() {
  const [settings, update] = useScreenSettings();
  const shot = useScreenshot();
  const fileInputId = useId();
  return { settings, update, ...shot, fileInputId };
}

export type GameScreenState = ReturnType<typeof useGameScreen>;

/**
 * The stage: the mock game screen as large as the centre allows, with a floating toolbar (grid, background,
 * resolution, and a settings popover; screen settings are set once and then left alone, so they stay out of the way).
 * Draws `children` inside UIParent at the configured resolution and scale.
 */
export function GameScreenStage({ screen, children }: { screen: GameScreenState; children: (ui: UiParent) => ReactNode }) {
  const { settings, update, screenshot } = screen;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const backgroundOn = settings.showBackground && !!screenshot;
  return (
    <Stage
      toolbar={
        <StageToolbar label="Game screen">
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
            // Opens the settings panel's file input, so there is one input and one code path.
            <IconButton
              label="Add a background image"
              icon={<ImageIcon />}
              size="sm"
              onClick={() => document.getElementById(screen.fileInputId)?.click()}
            />
          )}
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
              fileInputId={screen.fileInputId}
            />
          </Popover>
        </StageToolbar>
      }
    >
      <MockScreen settings={settings} backgroundUrl={screenshot?.url} fill>
        {children}
      </MockScreen>
    </Stage>
  );
}
