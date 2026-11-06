import { describe, expect, it } from "vitest";
import { anchorFrameFor, fitScale, placeAura, toPixels, uiParent } from "./geometry";
import { sanitizeScreenSettings, DEFAULT_SCREEN_SETTINGS } from "./settings";

const res = (width: number, height: number, uiScale: number | null) => ({
  width,
  height,
  useUiScale: uiScale !== null,
  uiScale: uiScale ?? 1,
});

describe("uiParent", () => {
  it.each([
    // [settings, UIParent width, height, pixels per unit]
    [res(1920, 1080, null), 1365.333, 768, 1.40625],
    [res(1920, 1080, 0.5), 2730.667, 1536, 0.703125],
    [res(1920, 1080, 768 / 1080), 1920, 1080, 1], // ElvUI's "pixel perfect" scale
    [res(2560, 1440, 0.6), 2275.556, 1280, 1.125],
    [res(1024, 768, null), 1024, 768, 1],
    [res(3440, 1440, 1), 1834.667, 768, 1.875],
    // "Use UI Scale" off ignores the stored scale.
    [{ width: 1920, height: 1080, useUiScale: false, uiScale: 0.64 }, 1365.333, 768, 1.40625],
  ])("%o → %f x %f units, %f px/unit", (settings, width, height, ppu) => {
    const ui = uiParent(settings);
    expect(ui.width).toBeCloseTo(width, 2);
    expect(ui.height).toBeCloseTo(height, 2);
    expect(ui.pixelsPerUnit).toBeCloseTo(ppu, 6);
    // UIParent always fills the window.
    expect(ui.width * ui.pixelsPerUnit).toBeCloseTo(settings.width, 6);
    expect(ui.height * ui.pixelsPerUnit).toBeCloseTo(settings.height, 6);
  });
});

const icon = (selfPoint: string, anchorPoint: string, xOffset = 0, yOffset = 0, anchorFrameType = "SCREEN") => ({
  anchorFrameType,
  selfPoint,
  anchorPoint,
  xOffset,
  yOffset,
  width: 64,
  height: 64,
});

describe("placeAura in window pixels", () => {
  it.each([
    // [window, aura, expected pixel rect]
    ["1080p, no UI scale, centred", res(1920, 1080, null), icon("CENTER", "CENTER"), { x: 915, y: 495, width: 90, height: 90 }],
    ["1440p ×0.6, TOPLEFT +10,-20", res(2560, 1440, 0.6), icon("TOPLEFT", "TOPLEFT", 10, -20), { x: 11.25, y: 22.5, width: 72, height: 72 }],
    ["pixel perfect, BOTTOMRIGHT -5,+5", res(1920, 1080, 768 / 1080), icon("BOTTOMRIGHT", "BOTTOMRIGHT", -5, 5), { x: 1851, y: 1011, width: 64, height: 64 }],
    ["pixel perfect, TOP of icon on BOTTOM", res(1920, 1080, 768 / 1080), icon("TOP", "BOTTOM"), { x: 928, y: 1080, width: 64, height: 64 }],
    ["pixel perfect, LEFT on RIGHT", res(1920, 1080, 768 / 1080), icon("LEFT", "RIGHT"), { x: 1920, y: 508, width: 64, height: 64 }],
    ["pixel perfect, TOPRIGHT on BOTTOMLEFT", res(1920, 1080, 768 / 1080), icon("TOPRIGHT", "BOTTOMLEFT"), { x: -64, y: 1080, width: 64, height: 64 }],
    ["pixel perfect, BOTTOMLEFT on TOPRIGHT", res(1920, 1080, 768 / 1080), icon("BOTTOMLEFT", "TOPRIGHT"), { x: 1920, y: -64, width: 64, height: 64 }],
    ["pixel perfect, RIGHT on LEFT", res(1920, 1080, 768 / 1080), icon("RIGHT", "LEFT"), { x: -64, y: 508, width: 64, height: 64 }],
    ["pixel perfect, BOTTOM on TOP, +y moves up", res(1920, 1080, 768 / 1080), icon("BOTTOM", "TOP", 0, -100), { x: 928, y: 36, width: 64, height: 64 }],
    ["1024x768 ×1, UIPARENT CENTER +100,+50", res(1024, 768, 1), icon("CENTER", "CENTER", 100, 50, "UIPARENT"), { x: 580, y: 302, width: 64, height: 64 }],
    ["4:3 ×0.8, CENTER", res(1600, 1200, 0.8), icon("CENTER", "CENTER"), { x: 760, y: 560, width: 80, height: 80 }],
  ])("%s", (_name, window, aura, expected) => {
    const ui = uiParent(window);
    const px = toPixels(placeAura(aura, ui).rect, ui);
    expect(px.x).toBeCloseTo(expected.x, 6);
    expect(px.y).toBeCloseTo(expected.y, 6);
    expect(px.width).toBeCloseTo(expected.width, 6);
    expect(px.height).toBeCloseTo(expected.height, 6);
  });

  it("an unknown anchor point means CENTER", () => {
    const ui = uiParent(res(1920, 1080, 768 / 1080));
    const px = toPixels(placeAura(icon("NOPE", "CENTER"), ui).rect, ui);
    expect(px).toEqual({ x: 928, y: 508, width: 64, height: 64 });
  });
});

describe("anchorFrameFor", () => {
  const ui = uiParent(res(1920, 1080, 0.64));

  it.each(["SCREEN", "UIPARENT", undefined])("%s is the whole screen", (type) => {
    const frame = anchorFrameFor({ anchorFrameType: type, anchorPoint: "TOP" }, ui);
    expect(frame.rect).toEqual({ x: 0, y: 0, width: ui.width, height: ui.height });
    expect(frame.label).toBeUndefined();
    expect(frame.anchorPoint).toBe("TOP");
  });

  it.each([
    ["PRD", "Personal Resource Display"],
    ["NAMEPLATE", "Nameplate"],
    ["UNITFRAME", "Unit frame"],
    ["MOUSE", "Mouse cursor"],
    ["SELECTFRAME", "Selected frame"],
    ["CUSTOM", "Custom anchor"],
  ])("%s gets a labelled stand-in on screen", (type, label) => {
    const frame = anchorFrameFor({ anchorFrameType: type, anchorPoint: "TOP" }, ui);
    expect(frame.label).toBe(label);
    expect(frame.rect.x).toBeGreaterThanOrEqual(0);
    expect(frame.rect.y).toBeGreaterThanOrEqual(0);
    expect(frame.rect.x + frame.rect.width).toBeLessThanOrEqual(ui.width);
    expect(frame.rect.y + frame.rect.height).toBeLessThanOrEqual(ui.height);
  });

  it("MOUSE always anchors to the cursor's centre", () => {
    const frame = anchorFrameFor({ anchorFrameType: "MOUSE", anchorPoint: "TOPLEFT" }, ui);
    expect(frame.anchorPoint).toBe("CENTER");
    const placed = placeAura(icon("CENTER", "TOPLEFT", 0, 0, "MOUSE"), ui);
    expect(placed.rect.x + 32).toBeCloseTo(frame.rect.x, 6);
    expect(placed.rect.y + 32).toBeCloseTo(frame.rect.y, 6);
  });

  it("names the selected frame", () => {
    expect(anchorFrameFor({ anchorFrameType: "SELECTFRAME", anchorFrameFrame: "PlayerFrame" }, ui).label).toBe(
      "Frame: PlayerFrame",
    );
  });

  it("PRD keeps its pixel size whatever the UI scale", () => {
    for (const scale of [0.64, 1]) {
      const u = uiParent(res(1920, 1080, scale));
      const frame = anchorFrameFor({ anchorFrameType: "PRD" }, u);
      expect(frame.rect.width * u.pixelsPerUnit).toBeCloseTo((196 * 1080) / 768, 6);
    }
  });
});

describe("fitScale", () => {
  it.each([
    [{ width: 1920, height: 1080 }, { width: 960, height: 1000 }, 0.5],
    [{ width: 1920, height: 1080 }, { width: 4000, height: 540 }, 0.5],
    [{ width: 1024, height: 768 }, { width: 512, height: 384 }, 0.5],
  ])("%o in %o → %f", (window, area, scale) => {
    expect(fitScale(window, area)).toBeCloseTo(scale, 6);
  });
});

describe("sanitizeScreenSettings", () => {
  it("falls back to defaults for junk", () => {
    expect(sanitizeScreenSettings(null)).toEqual(DEFAULT_SCREEN_SETTINGS);
    expect(sanitizeScreenSettings({ width: "x", uiScale: NaN })).toEqual(DEFAULT_SCREEN_SETTINGS);
  });

  it("clamps out-of-range numbers", () => {
    const s = sanitizeScreenSettings({ width: 10, height: 99999, uiScale: 9, useUiScale: false });
    expect(s).toMatchObject({ width: 320, height: 7680, uiScale: 1.5, useUiScale: false });
  });
});
