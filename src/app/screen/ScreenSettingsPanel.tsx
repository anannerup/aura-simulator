"use client";

import { useState, type KeyboardEvent } from "react";
import { UI_BASE_HEIGHT, uiParent } from "@/render/screen/geometry";
import {
  MAX_RESOLUTION,
  MAX_UI_SCALE,
  MIN_RESOLUTION,
  MIN_UI_SCALE,
  RESOLUTION_PRESETS,
  type ScreenSettings,
} from "@/render/screen/settings";
import type { Screenshot } from "./screenshot-store";
import styles from "./ScreenSettingsPanel.module.css";

export interface ScreenSettingsPanelProps {
  settings: ScreenSettings;
  onChange: (patch: Partial<ScreenSettings>) => void;
  screenshot: Screenshot | null;
  screenshotError: string | null;
  onChooseScreenshot: (file: File) => void;
  onClearScreenshot: () => void;
}

const presetKey = (w: number, h: number) => `${w}x${h}`;

/** Resolution, UI scale, grid and screenshot settings for the mock game screen. */
export function ScreenSettingsPanel(props: ScreenSettingsPanelProps) {
  const { settings, onChange, screenshot } = props;
  const ui = uiParent(settings);
  const current = presetKey(settings.width, settings.height);
  const isPreset = RESOLUTION_PRESETS.some((p) => presetKey(p.width, p.height) === current);
  const mismatch = screenshot && (screenshot.width !== settings.width || screenshot.height !== settings.height);

  return (
    <fieldset className={styles.panel}>
      <legend>Game screen</legend>

      <div className={styles.row}>
        <label>
          Resolution{" "}
          <select
            value={isPreset ? current : "custom"}
            onChange={(e) => {
              const p = RESOLUTION_PRESETS.find((r) => presetKey(r.width, r.height) === e.target.value);
              if (p) onChange({ width: p.width, height: p.height });
            }}
          >
            {RESOLUTION_PRESETS.map((p) => (
              <option key={presetKey(p.width, p.height)} value={presetKey(p.width, p.height)}>
                {p.width} × {p.height}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
        <NumberField
          label="Width"
          value={settings.width}
          min={MIN_RESOLUTION}
          max={MAX_RESOLUTION}
          step={1}
          onCommit={(width) => onChange({ width })}
        />
        <span aria-hidden>×</span>
        <NumberField
          label="Height"
          value={settings.height}
          min={MIN_RESOLUTION}
          max={MAX_RESOLUTION}
          step={1}
          onCommit={(height) => onChange({ height })}
        />
      </div>

      <div className={styles.row}>
        <label>
          <input
            type="checkbox"
            checked={settings.useUiScale}
            onChange={(e) => onChange({ useUiScale: e.target.checked })}
          />{" "}
          Use UI scale
        </label>
        <input
          type="range"
          aria-label="UI scale slider"
          min={MIN_UI_SCALE}
          max={MAX_UI_SCALE}
          step={0.01}
          value={settings.uiScale}
          disabled={!settings.useUiScale}
          onChange={(e) => onChange({ uiScale: Number(e.target.value) })}
        />
        <NumberField
          label="UI scale"
          value={Number(settings.uiScale.toFixed(4))}
          min={MIN_UI_SCALE}
          max={MAX_UI_SCALE}
          step={0.01}
          disabled={!settings.useUiScale}
          onCommit={(uiScale) => onChange({ uiScale })}
        />
        <button
          type="button"
          title="1 UI unit = 1 screen pixel (768 / height, ElvUI's pixel perfect scale)"
          onClick={() => onChange({ useUiScale: true, uiScale: UI_BASE_HEIGHT / settings.height })}
        >
          Pixel perfect
        </button>
      </div>

      <p className={styles.meta} data-testid="ui-parent-size">
        UIParent {ui.width.toFixed(0)} × {ui.height.toFixed(0)} units, 1 unit = {ui.pixelsPerUnit.toFixed(3)} screen
        pixels{settings.useUiScale ? "" : " (UI scale off: 768 units high)"}
      </p>

      <div className={styles.row}>
        <label>
          <input type="checkbox" checked={settings.showGrid} onChange={(e) => onChange({ showGrid: e.target.checked })} />{" "}
          Grid and centre lines
        </label>
      </div>

      <div className={styles.row}>
        <label>
          Screenshot{" "}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) props.onChooseScreenshot(file);
              e.target.value = "";
            }}
          />
        </label>
        {screenshot && (
          <>
            <label>
              <input
                type="checkbox"
                checked={settings.showBackground}
                onChange={(e) => onChange({ showBackground: e.target.checked })}
              />{" "}
              Show screenshot
            </label>
            <button type="button" onClick={props.onClearScreenshot}>
              Remove screenshot
            </button>
          </>
        )}
      </div>
      {screenshot && (
        <p className={styles.meta}>
          {screenshot.name}: {screenshot.width} × {screenshot.height}, kept in this browser only.
          {mismatch && (
            <>
              {" "}
              It does not match the resolution, so it is stretched.{" "}
              <button type="button" onClick={() => onChange({ width: screenshot.width, height: screenshot.height })}>
                Use {screenshot.width} × {screenshot.height}
              </button>
            </>
          )}
        </p>
      )}
      {props.screenshotError && <p className={styles.error}>{props.screenshotError}</p>}
    </fieldset>
  );
}

/** A number input that only applies its value on blur or Enter, so half-typed numbers don't jump the screen. */
function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) props.onCommit(n);
    setDraft(null);
  };
  return (
    <label>
      {props.label}{" "}
      <input
        type="number"
        className={styles.number}
        min={props.min}
        max={props.max}
        step={props.step}
        disabled={props.disabled}
        value={draft ?? String(props.value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") commit();
        }}
      />
    </label>
  );
}
