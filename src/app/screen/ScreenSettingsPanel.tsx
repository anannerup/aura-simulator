"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Button, Callout, Field, ImageIcon, Input, Select, Slider, Switch, TrashIcon, WarningIcon } from "@/components/ui";
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
  /** Id for the screenshot file input, so other controls (the stage toolbar) can open it. */
  fileInputId?: string;
}

const presetKey = (w: number, h: number) => `${w}x${h}`;

/** Resolution, UI scale, grid and screenshot settings for the mock game screen. */
export function ScreenSettingsPanel(props: ScreenSettingsPanelProps) {
  const { settings, onChange, screenshot } = props;
  const ids = useId();
  const fileInputId = props.fileInputId ?? `${ids}-file`;
  const ui = uiParent(settings);
  const current = presetKey(settings.width, settings.height);
  const isPreset = RESOLUTION_PRESETS.some((p) => presetKey(p.width, p.height) === current);
  const mismatch = screenshot && (screenshot.width !== settings.width || screenshot.height !== settings.height);

  return (
    <div className={styles.panel}>
      <div className={styles.group}>
        <Field label="Resolution" htmlFor={`${ids}-res`}>
          <Select
            id={`${ids}-res`}
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
          </Select>
        </Field>
        <div className={styles.pair}>
          <NumberField
            label="Width"
            value={settings.width}
            min={MIN_RESOLUTION}
            max={MAX_RESOLUTION}
            step={1}
            onCommit={(width) => onChange({ width })}
          />
          <span className={styles.times} aria-hidden>
            ×
          </span>
          <NumberField
            label="Height"
            value={settings.height}
            min={MIN_RESOLUTION}
            max={MAX_RESOLUTION}
            step={1}
            onCommit={(height) => onChange({ height })}
          />
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.scaleHead}>
          <Switch
            label="Use UI scale"
            checked={settings.useUiScale}
            onChange={(e) => onChange({ useUiScale: e.target.checked })}
          />
          <Button
            size="sm"
            variant="ghost"
            title="1 UI unit = 1 screen pixel (768 / height, ElvUI's pixel perfect scale)"
            onClick={() => onChange({ useUiScale: true, uiScale: UI_BASE_HEIGHT / settings.height })}
          >
            Pixel perfect
          </Button>
        </div>
        <div className={styles.scaleRow}>
          <Slider
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
            hideLabel
            value={Number(settings.uiScale.toFixed(4))}
            min={MIN_UI_SCALE}
            max={MAX_UI_SCALE}
            step={0.01}
            disabled={!settings.useUiScale}
            onCommit={(uiScale) => onChange({ uiScale })}
          />
        </div>
        <p className={styles.readout} data-testid="ui-parent-size">
          UIParent {ui.width.toFixed(0)} × {ui.height.toFixed(0)} units, 1 unit = {ui.pixelsPerUnit.toFixed(3)} screen
          pixels{settings.useUiScale ? "" : " (UI scale off: 768 units high)"}
        </p>
      </div>

      <div className={styles.group}>
        <Switch label="Grid and centre lines" checked={settings.showGrid} onChange={(e) => onChange({ showGrid: e.target.checked })} />
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>Background image</div>
        {screenshot ? (
          <div className={styles.shot}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
            <img className={styles.thumb} src={screenshot.url} alt="" />
            <div className={styles.shotInfo}>
              <span className={styles.shotName}>{screenshot.name}</span>
              <span className={styles.shotMeta}>
                {screenshot.width} × {screenshot.height}, kept in this browser only.
              </span>
            </div>
          </div>
        ) : (
          <p className={styles.hint}>A screenshot of your game behind the screen, to judge the aura against your real UI.</p>
        )}
        {screenshot && mismatch && (
          <Callout tone="warn" icon={<WarningIcon size={14} />}>
            <span>It does not match the resolution, so it is stretched.</span>
            <span>
              <Button size="sm" onClick={() => onChange({ width: screenshot.width, height: screenshot.height })}>
                Use {screenshot.width} × {screenshot.height}
              </Button>
            </span>
          </Callout>
        )}
        {screenshot && (
          <Switch
            label="Show screenshot"
            checked={settings.showBackground}
            onChange={(e) => onChange({ showBackground: e.target.checked })}
          />
        )}
        <div className={styles.fileRow}>
          <label className={styles.fileButton}>
            <input
              id={fileInputId}
              type="file"
              accept="image/*"
              aria-label="Screenshot"
              className={styles.fileInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) props.onChooseScreenshot(file);
                e.target.value = "";
              }}
            />
            <ImageIcon size={14} />
            {screenshot ? "Replace image" : "Choose image"}
          </label>
          {screenshot && (
            <Button size="sm" variant="ghost" icon={<TrashIcon size={14} />} onClick={props.onClearScreenshot}>
              Remove screenshot
            </Button>
          )}
        </div>
        {props.screenshotError && <p className={styles.error}>{props.screenshotError}</p>}
      </div>
    </div>
  );
}

/** A number input that only applies its value on blur or Enter, so half-typed numbers don't jump the screen. */
function NumberField(props: {
  label: string;
  hideLabel?: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) props.onCommit(n);
    setDraft(null);
  };
  const input = (
    <Input
      id={id}
      type="number"
      aria-label={props.hideLabel ? props.label : undefined}
      className={props.hideLabel ? styles.scaleInput : undefined}
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
  );
  if (props.hideLabel) return input;
  return (
    <Field label={props.label} htmlFor={id}>
      {input}
    </Field>
  );
}
