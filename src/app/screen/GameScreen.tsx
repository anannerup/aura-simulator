"use client";

import type { ReactNode } from "react";
import type { UiParent } from "@/render/screen/geometry";
import { MockScreen } from "@/render/screen/MockScreen";
import { ScreenSettingsPanel } from "./ScreenSettingsPanel";
import { useScreenSettings } from "./screen-settings-store";
import { useScreenshot } from "./screenshot-store";

/** The mock game screen with its settings: draws `children` inside UIParent at the configured resolution and scale. */
export function GameScreen({ children }: { children: (ui: UiParent) => ReactNode }) {
  const [settings, update] = useScreenSettings();
  const { screenshot, error, choose, clear } = useScreenshot();
  return (
    <>
      <MockScreen settings={settings} backgroundUrl={screenshot?.url}>
        {children}
      </MockScreen>
      <ScreenSettingsPanel
        settings={settings}
        onChange={update}
        screenshot={screenshot}
        screenshotError={error}
        onChooseScreenshot={choose}
        onClearScreenshot={clear}
      />
    </>
  );
}
