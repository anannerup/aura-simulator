import { describe, expect, it } from "vitest";
import {
  barLayout,
  barProgress,
  barTextureTurn,
  foregroundBox,
  sparkCenter,
  sparkTextureTurn,
  sparkVisible,
  tickPlacement,
} from "./bar-geometry";
import { backdropPieces } from "./subregions/Border";
import { drawOrder } from "./subregions/SubRegions";
import { regionInfo } from "./region-types";
import { anchorFraction } from "./screen/geometry";
import { fontFlagsStyle, fontFamily, fontUrl } from "./fonts";
import { createTextureLoader } from "./textures";
import { forever } from "@/games/forever";
import { statusBarTexture } from "./media";
import { formatText } from "./text-format";

describe("bar progress", () => {
  it("is time left over duration, inverted by Inverse, clamped", () => {
    expect(barProgress({ remaining: 15, duration: 60, inverse: false }).progress).toBeCloseTo(0.25);
    expect(barProgress({ remaining: 15, duration: 60, inverse: true }).progress).toBeCloseTo(0.75);
    expect(barProgress({ remaining: 90, duration: 60, inverse: false }).progress).toBe(1);
  });

  it("is empty without a timer, full when inverted; empty on the Aura (Modern) missing button", () => {
    expect(barProgress({ remaining: undefined, duration: 0, inverse: false }).progress).toBe(0);
    expect(barProgress({ remaining: undefined, duration: 0, inverse: true }).progress).toBe(1);
    expect(barProgress({ remaining: 10, duration: 60, inverse: true, missing: true }).progress).toBe(0);
  });

  it("honours adjusted min/max (seconds or percent)", () => {
    const p = barProgress({ remaining: 20, duration: 60, inverse: false, adjustedMax: "30" });
    expect(p.progress).toBeCloseTo(20 / 30);
    expect(p.max).toBe(30);
    const q = barProgress({ remaining: 20, duration: 60, inverse: false, adjustedMin: "10", adjustedMax: "50%" });
    expect(q.progress).toBeCloseTo((20 - 10) / (30 - 10));
  });
});

describe("bar layout and orientation", () => {
  const bar = { left: 0, top: 0, width: 200, height: 20 };

  it("grows from the left, right, top or bottom", () => {
    expect(foregroundBox(bar, "HORIZONTAL", 0.25)).toEqual({ left: 0, top: 0, width: 50, height: 20 });
    expect(foregroundBox(bar, "HORIZONTAL_INVERSE", 0.25)).toEqual({ left: 150, top: 0, width: 50, height: 20 });
    const tall = { left: 0, top: 0, width: 20, height: 100 };
    expect(foregroundBox(tall, "VERTICAL", 0.3)).toEqual({ left: 0, top: 0, width: 20, height: 30 });
    expect(foregroundBox(tall, "VERTICAL_INVERSE", 0.3)).toEqual({ left: 0, top: 70, width: 20, height: 30 });
    expect(foregroundBox(bar, "HORIZONTAL", 0)).toBeNull();
  });

  it("puts the spark on the growing edge", () => {
    expect(sparkCenter(bar, "HORIZONTAL", 0.25)).toEqual({ x: 50, y: 10 });
    expect(sparkCenter(bar, "HORIZONTAL_INVERSE", 0.25)).toEqual({ x: 150, y: 10 });
    expect(sparkCenter({ left: 0, top: 0, width: 20, height: 100 }, "VERTICAL_INVERSE", 0.3, 2, 5)).toEqual({ x: 12, y: 65 });
    expect(sparkVisible(true, "FULL", 1)).toBe(false);
    expect(sparkVisible(true, "EMPTY", 0.5)).toBe(true);
    expect(sparkVisible(false, "NEVER", 0.5)).toBe(false);
  });

  it("places the square icon and the bar beside it", () => {
    expect(barLayout({ width: 200, height: 20, orientation: "HORIZONTAL", icon: true, iconSide: "LEFT" })).toEqual({
      icon: { left: 0, top: 0, width: 20, height: 20 },
      bar: { left: 20, top: 0, width: 180, height: 20 },
    });
    expect(barLayout({ width: 200, height: 20, orientation: "HORIZONTAL", icon: true, iconSide: "RIGHT" }).icon).toEqual({ left: 180, top: 0, width: 20, height: 20 });
    expect(barLayout({ width: 20, height: 100, orientation: "VERTICAL", icon: true, iconSide: "RIGHT" })).toEqual({
      icon: { left: 0, top: 80, width: 20, height: 20 },
      bar: { left: 0, top: 0, width: 20, height: 80 },
    });
  });

  it("turns the texture with the orientation and the spark by its rotation", () => {
    expect(barTextureTurn("HORIZONTAL_INVERSE")).toEqual({ rotate: 0, mirror: true });
    expect(barTextureTurn("VERTICAL")).toEqual({ rotate: 90, mirror: false });
    expect(barTextureTurn("VERTICAL_INVERSE")).toEqual({ rotate: -90, mirror: false });
    expect(sparkTextureTurn("HORIZONTAL", "MANUAL", 90, false)).toEqual({ rotate: -90, mirror: false });
    expect(sparkTextureTurn("VERTICAL", "AUTO", 0, false)).toEqual({ rotate: 90, mirror: false });
  });
});

describe("ticks", () => {
  const base = {
    mode: "AtValue" as const,
    placement: 15,
    min: 0,
    max: 60,
    orientation: "HORIZONTAL" as const,
    inverse: false,
    barWidth: 200,
    barHeight: 20,
    thickness: 2,
    length: 30,
    automaticLength: true,
    xOffset: 0,
    yOffset: 0,
  };

  it("sits at its value's share of the bar from the side the bar grows from", () => {
    expect(tickPlacement(base)).toMatchObject({ x: 50, y: 10, width: 2, height: 20, visible: true });
    expect(tickPlacement({ ...base, orientation: "HORIZONTAL_INVERSE" }).x).toBe(150);
    expect(tickPlacement({ ...base, inverse: true }).x).toBe(150);
    expect(tickPlacement({ ...base, orientation: "VERTICAL", barWidth: 20, barHeight: 120 })).toMatchObject({ x: 10, y: 30, width: 20, height: 2 });
    expect(tickPlacement({ ...base, orientation: "VERTICAL_INVERSE", barWidth: 20, barHeight: 120 }).y).toBe(90);
  });

  it("supports missing value, percent and value offset modes; hides out-of-range ticks", () => {
    expect(tickPlacement({ ...base, mode: "AtMissingValue" }).x).toBe(150);
    expect(tickPlacement({ ...base, mode: "AtPercent", placement: 50 }).x).toBe(100);
    expect(tickPlacement({ ...base, mode: "ValueOffset", placement: -5, remaining: 35 }).x).toBe(100);
    expect(tickPlacement({ ...base, placement: 90 }).visible).toBe(false);
    expect(tickPlacement({ ...base, max: 0 }).visible).toBe(false);
  });

  it("uses the fixed length and offsets (y up)", () => {
    expect(tickPlacement({ ...base, automaticLength: false, length: 8, xOffset: 3, yOffset: 4 })).toMatchObject({ x: 53, y: 6, height: 8 });
  });
});

describe("sub-region draw order", () => {
  it("follows the list; the region's own parts sit at subbackground/subforeground", () => {
    const order = drawOrder({
      regionType: "aurabar",
      subRegions: [{ type: "subtext" }, { type: "subbackground" }, { type: "subborder" }, { type: "subforeground" }, { type: "subglow" }],
    });
    expect(order.map((o) => o.kind)).toEqual(["subtext", "background", "subborder", "foreground", "subglow"]);
  });

  it("puts missing background/foreground first", () => {
    expect(drawOrder({ regionType: "icon", subRegions: [{ type: "subtext" }] }).map((o) => o.kind)).toEqual(["background", "subtext"]);
    expect(drawOrder({ regionType: "aurabar", subRegions: [] }).map((o) => o.kind)).toEqual(["background", "foreground"]);
  });
});

describe("sub-text anchors and borders", () => {
  it("resolves AUTO self points per parent", () => {
    const auto = (anchorPoint: string, parent: string) => regionInfo(parent).autoSelfPoint(anchorPoint);
    expect(auto("INNER_LEFT", "aurabar")).toBe("LEFT");
    expect(auto("ICON_TOP", "aurabar")).toBe("TOP");
    expect(anchorFraction(auto("SPARK", "aurabar"))).toEqual(anchorFraction("CENTER"));
    expect(auto("OUTER_TOP", "icon")).toBe("BOTTOM");
    expect(auto("TOP", "icon")).toBe("CENTER");
  });

  it("splits a backdrop into corners and edges", () => {
    const p = backdropPieces({ left: 0, top: 0, width: 100, height: 20 }, 4);
    expect(p.topRight).toEqual({ left: 96, top: 0, width: 4, height: 4 });
    expect(p.left).toEqual({ left: 0, top: 4, width: 4, height: 12 });
    expect(p.bottom).toEqual({ left: 4, top: 16, width: 92, height: 4 });
  });
});

describe("media and fonts", () => {
  it("maps LSM statusbar names and the texture picker", () => {
    expect(statusBarTexture({})).toBe(137012);
    expect(statusBarTexture({ texture: "Clean" })).toBe("Interface\\AddOns\\WeakAuras\\Media\\Textures\\Statusbar_Clean");
    expect(statusBarTexture({ textureSource: "Picker", textureInput: "Interface\\Buttons\\WHITE8X8" })).toBe("Interface\\Buttons\\WHITE8X8");
  });

  it("loads game fonts by FileDataID or from the addon, with web font fallbacks", () => {
    expect(fontUrl(615960)).toBe("https://wago.tools/api/casc/615960");
    expect(fontUrl("Interface\\AddOns\\WeakAuras\\Media\\Fonts\\FiraMono-Medium.ttf", createTextureLoader({ addonFileUrl: (p) => forever.addon.fileUrl("1.15.0", p) }))).toBe(
      "https://cdn.jsdelivr.net/gh/dldvlpr-addons-wow/Musca-Auras@1.15.0/WeakAuras/Media/Fonts/FiraMono-Medium.ttf",
    );
    expect(fontFamily(undefined)).toMatch(/^"WoW Friz Quadrata TT", /);
    expect(fontFamily("Morpheus")).toMatch(/^"WoW Morpheus", .*"WoW Friz Quadrata TT"/);
  });

  it("draws outlines and shadows like the font flags", () => {
    expect(fontFlagsStyle("OUTLINE", { color: [0, 0, 0, 1], x: 0, y: 0 }).textShadow?.split(", ")).toHaveLength(8);
    expect(fontFlagsStyle("THICKOUTLINE", { color: [0, 0, 0, 1], x: 0, y: 0 }).textShadow).toContain("2px 2px 0 #000");
    expect(fontFlagsStyle("None", { color: [0, 0, 0, 1], x: 1, y: -1 }).textShadow).toBe("1px 1px 0 rgba(0, 0, 0, 1)");
    expect(fontFlagsStyle("OUTLINE|SLUG", { color: [0, 0, 0, 1], x: 1, y: -1 }).textShadow?.split(", ")).toHaveLength(8);
  });
});

describe("text format codes", () => {
  it("formats the text region's codes with its own options", () => {
    const states = new Map([[0, { index: 1, kind: "other" as const, active: true, missing: false, remaining: 125, duration: 300, stacks: 3, values: {}, frozen: false }]]);
    const opts: Record<string, number> = { p_time_dynamic_threshold: 0 };
    expect(formatText("%n: %p (%s) %t %%", (k) => opts[k], { states, name: "Shield" })).toBe("Shield: 2:05 (3) 5:00 %");
  });
});
