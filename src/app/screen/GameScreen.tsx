"use client";

import { useId, type ReactNode } from "react";
import { Stage, StageToolbar, ToolbarSeparator, ToolbarText } from "@/components/shell";
import { GridIcon, IconButton, ImageIcon } from "@/components/ui";
import type { UiParent } from "@/render/screen/geometry";
import { MockScreen } from "@/render/screen/MockScreen";
import { ScreenSettingsPanel } from "./ScreenSettingsPanel";
import { useScreenSettings } from "./screen-settings-store";
import { useScreenshot } from "./screenshot-store";
import toolbarStyles from "./GameScreen.module.css";

/** The mock screen's settings and screenshot, shared by the stage (screen + toolbar) and the settings panel. */
export function useGameScreen() {
  const [settings, update] = useScreenSettings();
  const shot = useScreenshot();
  const fileInputId = useId();
  return { settings, update, ...shot, fileInputId };
}

export type GameScreenState = ReturnType<typeof useGameScreen>;

/**
 * The stage: the mock game screen as large as the centre allows, with a floating toolbar (grid, background,
 * resolution). Draws `children` inside UIParent at the configured resolution and scale.
 */
export function GameScreenStage({ screen, children }: { screen: GameScreenState; children: (ui: UiParent) => ReactNode }) {
  const { settings, update, screenshot } = screen;
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
            <span className={toolbarStyles.dim}> · UI scale {settings.useUiScale ? settings.uiScale.toFixed(2) : "off"}</span>
          </ToolbarText>
        </StageToolbar>
      }
    >
      <MockScreen settings={settings} backgroundUrl={screenshot?.url} fill>
        {children}
      </MockScreen>
    </Stage>
  );
}

/** The screen settings for the inspector. */
export function GameScreenSettings({ screen }: { screen: GameScreenState }) {
  return (
    <ScreenSettingsPanel
      settings={screen.settings}
      onChange={screen.update}
      screenshot={screen.screenshot}
      screenshotError={screen.error}
      onChooseScreenshot={screen.choose}
      onClearScreenshot={screen.clear}
      fileInputId={screen.fileInputId}
    />
  );
}
