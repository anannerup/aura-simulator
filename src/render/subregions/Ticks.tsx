"use client";

import { getField, list, type AuraRenderState, type LuaTable, type LuaValue } from "@/core";
import { tickPlacement, type TickMode } from "../bar-geometry";
import { CASTING_BAR_SPARK, textureSourceOf } from "../media";
import { TurnedTexture, rgbaCss } from "../TurnedTexture";
import type { SubRegionHost } from "./host";
import { color } from "../color";
import styles from "./subregions.module.css";

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);
const MODES = new Set(["AtValue", "AtMissingValue", "AtPercent", "ValueOffset"]);

/**
 * A tick sub-region on an aura bar (SubRegionTypes/Tick.lua): one mark per `tick_placements` entry, a flat
 * colour or a texture (`use_texture`, blend mode, rotation, mirror), placed along the bar by
 * {@link tickPlacement}. ValueOffset ticks use the aura's own timer (progress source -2, the default).
 */
export function Ticks({ element, position, state, host }: { element: LuaTable; position: number; state: AuraRenderState; host: SubRegionHost }) {
  const bar = host.bar;
  if (!bar) return null;
  const p = state.properties;
  const g = (k: string) => getField(element, k);
  const visible = p[`sub.${position}.tick_visible`] !== false;
  const rgba = color(p[`sub.${position}.tick_color`] ?? g("tick_color"));
  const modeValue = String(g("tick_placement_mode") ?? "AtValue");
  const mode = (MODES.has(modeValue) ? modeValue : "AtValue") as TickMode;
  const placements = list(g("tick_placements") ?? ["50"])
    .map((v) => (typeof v === "number" ? v : Number(v)))
    .filter((v) => Number.isFinite(v));
  const useTexture = g("use_texture") === true;
  const texture = useTexture ? textureSourceOf(g("tick_texture")) ?? CASTING_BAR_SPARK : null;
  const rotation = num(g("tick_rotation"), 0);
  const mirror = g("tick_mirror") === true;
  return (
    <div
      className={styles.layer}
      style={{ ...bar.bar }}
      data-subregion="subtick"
      data-index={position}
      data-visible={visible ? "true" : "false"}
    >
      {placements.map((placement, i) => {
        const t = tickPlacement({
          mode,
          placement,
          min: bar.min,
          max: bar.max,
          remaining: bar.remaining,
          orientation: bar.orientation,
          inverse: bar.inverse,
          barWidth: bar.bar.width,
          barHeight: bar.bar.height,
          thickness: num(g("tick_thickness"), 2),
          length: num(g("tick_length"), 30),
          automaticLength: g("automatic_length") !== false,
          xOffset: num(g("tick_xOffset"), 0),
          yOffset: num(g("tick_yOffset"), 0),
        });
        const box = { left: t.x - t.width / 2, top: t.y - t.height / 2, width: t.width, height: t.height };
        const shown = visible && t.visible;
        const common = { "data-tick": i + 1, "data-visible": shown ? "true" : "false" };
        if (texture !== null) {
          return (
            <div key={i} {...common} style={{ display: shown ? undefined : "none" }}>
              <TurnedTexture
                source={texture}
                box={box}
                color={rgba}
                desaturate={g("tick_desaturate") === true}
                blend={String(g("tick_blend_mode") ?? "ADD")}
                // Tick.lua:448-457: the texture is drawn transposed, or turned clockwise when mirrored.
                turn={mirror ? { rotate: 90, mirror: false } : { rotate: 90, mirror: true }}
                style={rotation ? { transform: `rotate(${-rotation}deg)` } : undefined}
              />
            </div>
          );
        }
        return (
          <div
            key={i}
            {...common}
            className={styles.tile}
            style={{ ...box, background: rgbaCss(rgba), display: shown ? undefined : "none", transform: rotation ? `rotate(${-rotation}deg)` : undefined }}
          />
        );
      })}
    </div>
  );
}
