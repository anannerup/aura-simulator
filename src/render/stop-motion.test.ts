import { describe, expect, it } from "vitest";
import { progressFrame, stopMotionSheet, tileTexCoord, timedFrame } from "./stop-motion";

const sheet = stopMotionSheet({ texture: "Interface\\AddOns\\WeakAuras\\Media\\Textures\\stopmotion" });

describe("stop motion sheets (BaseRegions/StopMotion.lua:357-428)", () => {
  it("the addon's example sheet: 64 frames in 8×8 (Types.lua:4165)", () => {
    expect(sheet).toMatchObject({ startFrame: 1, endFrame: 64, rows: 8, columns: 8 });
    expect(stopMotionSheet({ texture: "Interface\\AddOns\\WeakAuras\\Media\\Textures\\stopmotion", startPercent: 0.5, endPercent: 0.75 })).toMatchObject({
      startFrame: 32,
      endFrame: 48,
    });
  });

  it("file names carry the grid", () => {
    expect(stopMotionSheet({ texture: "Interface\\AddOns\\X\\Fire.x4y8f30.tga" })).toMatchObject({ rows: 4, columns: 8, startFrame: 1, endFrame: 30 });
    const sized = stopMotionSheet({ texture: "Interface\\AddOns\\X\\Fire.x2y2f4w100h50W256H128.blp" });
    expect(sized).toMatchObject({ rows: 2, columns: 2, endFrame: 4 });
    expect(sized.frameScaleW).toBeCloseTo(200 / 256);
    expect(sized.frameScaleH).toBeCloseTo(100 / 128);
  });

  it("other textures use the custom settings", () => {
    expect(stopMotionSheet({ texture: "Interface\\AddOns\\X\\Sheet", customFrames: 16, customRows: 4, customColumns: 4 })).toMatchObject({
      rows: 4,
      columns: 4,
      endFrame: 16,
    });
  });
});

describe("frames over time (StopMotion.lua:229-277 TimedUpdate)", () => {
  const at = (seconds: number, animationType: string, inverse = false, s = sheet) => timedFrame(s, { seconds, frameRate: 15, animationType, inverse });

  it("loop steps frameRate frames a second and wraps", () => {
    expect(at(0, "loop")).toBe(1);
    expect(at(1, "loop")).toBe(16);
    expect(at(64 / 15 + 0.01, "loop")).toBe(1);
    expect(at(1, "loop", true)).toBe(64 - 15);
  });

  it("bounce goes back down after the last frame", () => {
    expect(at(63 / 15 + 0.001, "bounce")).toBe(64);
    expect(at(65 / 15 + 0.001, "bounce")).toBe(63);
  });

  it("once stops on the last frame", () => {
    expect(at(100, "once")).toBe(64);
  });

  it("a reversed range plays backwards", () => {
    const reversed = stopMotionSheet({ texture: "Interface\\AddOns\\WeakAuras\\Media\\Textures\\stopmotion", startPercent: 1, endPercent: 0 });
    expect(at(0, "loop", false, reversed)).toBe(64);
  });
});

describe("frames from progress (StopMotion.lua:280-306) and tiles (setTile)", () => {
  it("progress picks floor((frames - 1) · progress) + start", () => {
    expect(progressFrame(sheet, 0, false)).toBe(1);
    expect(progressFrame(sheet, 0.5, false)).toBe(32);
    expect(progressFrame(sheet, 1, false)).toBe(64);
    expect(progressFrame(sheet, 0.5, true)).toBe(33);
  });

  it("tiles run left to right, top to bottom", () => {
    expect(tileTexCoord(1, 8, 8)).toEqual([0, 0.125, 0, 0.125]);
    expect(tileTexCoord(10, 8, 8)).toEqual([0.125, 0.25, 0.125, 0.25]);
    expect(tileTexCoord(2, 2, 2, 0.5, 0.5)).toEqual([0.25, 0.5, 0, 0.25]);
  });
});
