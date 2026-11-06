"use client";

import { useState } from "react";
import { GLOW_DEFAULTS, Glow, type GlowOptions, type GlowType } from "@/render/glow";
import styles from "./glows.module.css";

const ICON = "https://wow.zamimg.com/images/wow/icons/large/spell_holy_magicalsentry.jpg";
const TYPES: { type: GlowType; label: string }[] = [
  { type: "buttonOverlay", label: "Action Button Glow" },
  { type: "Pixel", label: "Pixel Glow" },
  { type: "ACShine", label: "Autocast Shine" },
  { type: "Proc", label: "Proc Glow (not in Musca's menu)" },
];

function hex(c: readonly number[]) {
  return "#" + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
}

function fromHex(h: string, a: number): [number, number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
}

type NumKey = "glowLines" | "glowFrequency" | "glowDuration" | "glowLength" | "glowThickness" | "glowScale" | "glowXOffset" | "glowYOffset";
const NUMBERS: { key: NumKey; label: string; min: number; max: number; step: number }[] = [
  { key: "glowLines", label: "Lines & Particles", min: 1, max: 30, step: 1 },
  { key: "glowFrequency", label: "Frequency", min: -2, max: 2, step: 0.05 },
  { key: "glowDuration", label: "Duration (Proc)", min: 0.01, max: 3, step: 0.01 },
  { key: "glowLength", label: "Length", min: 1, max: 20, step: 1 },
  { key: "glowThickness", label: "Thickness", min: 1, max: 20, step: 1 },
  { key: "glowScale", label: "Scale", min: 0.05, max: 10, step: 0.05 },
  { key: "glowXOffset", label: "X-Offset", min: -100, max: 100, step: 1 },
  { key: "glowYOffset", label: "Y-Offset", min: -100, max: 100, step: 1 },
];

export function GlowDemo() {
  const [options, setOptions] = useState<GlowOptions>({ ...GLOW_DEFAULTS, glowStartAnim: true });
  const [visible, setVisible] = useState(true);
  const [size, setSize] = useState(64);
  const [restart, setRestart] = useState(0);
  const set = <K extends keyof GlowOptions>(key: K, value: GlowOptions[K]) => setOptions((o) => ({ ...o, [key]: value }));

  return (
    <div className={styles.page}>
      <h1>Glow renderer</h1>
      <p className={styles.note}>
        LibCustomGlow-1.0 as shipped in Musca Auras 1.15.0. Textures load from wago.tools at runtime.
      </p>
      <form className={styles.controls} onSubmit={(e) => e.preventDefault()}>
        <label>
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Glow (visible)
        </label>
        <label>
          <input type="checkbox" checked={options.useGlowColor} onChange={(e) => set("useGlowColor", e.target.checked)} /> Use Custom
          Color
        </label>
        <label>
          Color <input type="color" value={hex(options.glowColor)} onChange={(e) => set("glowColor", fromHex(e.target.value, options.glowColor[3]))} />
        </label>
        <label>
          Alpha
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={options.glowColor[3]}
            onChange={(e) => set("glowColor", [options.glowColor[0], options.glowColor[1], options.glowColor[2], Number(e.target.value)])}
          />
          <output>{options.glowColor[3]}</output>
        </label>
        {NUMBERS.map((n) => (
          <label key={n.key}>
            {n.label}
            <input
              type="range"
              name={n.key}
              min={n.min}
              max={n.max}
              step={n.step}
              value={options[n.key]}
              onChange={(e) => set(n.key, Number(e.target.value))}
            />
            <output>{options[n.key]}</output>
          </label>
        ))}
        <label>
          <input type="checkbox" checked={options.glowBorder} onChange={(e) => set("glowBorder", e.target.checked)} /> Border (Pixel)
        </label>
        <label>
          <input type="checkbox" checked={!!options.glowStartAnim} onChange={(e) => set("glowStartAnim", e.target.checked)} /> Start
          Animation (Proc)
        </label>
        <label>
          Icon size
          <input type="range" min={16} max={128} step={1} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          <output>{size}</output>
        </label>
        <button type="button" onClick={() => setRestart((r) => r + 1)}>
          Restart
        </button>
      </form>

      <div className={styles.grid}>
        {TYPES.map(({ type, label }) => (
          <section key={type} className={styles.cell} data-testid={`glow-${type}`}>
            <h2>{label}</h2>
            <div className={styles.row}>
              <div className={styles.target} style={{ width: size, height: size }}>
                <div className={styles.icon} style={{ backgroundImage: `url(${ICON})` }} />
                <Glow key={restart} type={type} options={options} width={size} height={size} visible={visible} />
              </div>
              <div className={styles.target} style={{ width: size * 3.5, height: Math.round(size / 3) }}>
                <div className={styles.bar} />
                <Glow key={restart} type={type} options={options} width={size * 3.5} height={Math.round(size / 3)} visible={visible} />
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
