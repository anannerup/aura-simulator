import { describe, expect, it } from "vitest";
import type { AuraDocument } from "@/core";
import { uiParent } from "../screen/geometry";
import { dynamicSelfPoint, growPositions } from "./grow";
import { layoutScreen, type LayoutNode } from "./layout";

// 1024x768 without UI scale: UIParent is 1024x768 units, centre (512, 384).
const ui = uiParent({ width: 1024, height: 768, useUiScale: false, uiScale: 1 });
const shown = (_aura: AuraDocument) => true; // eslint-disable-line @typescript-eslint/no-unused-vars

const icon = (id: string, extra: Partial<AuraDocument> = {}): LayoutNode => ({
  aura: { id, regionType: "icon", width: 64, height: 64, anchorPoint: "CENTER", selfPoint: "CENTER", anchorFrameType: "SCREEN", xOffset: 0, yOffset: 0, ...extra },
});
const group = (id: string, items: LayoutNode[], extra: Partial<AuraDocument> = {}): LayoutNode => ({
  aura: { id, regionType: "group", anchorPoint: "CENTER", anchorFrameType: "SCREEN", xOffset: 0, yOffset: 0, ...extra },
  items,
});
const dyn = (id: string, items: LayoutNode[], extra: Partial<AuraDocument> = {}): LayoutNode => ({
  aura: { id, regionType: "dynamicgroup", anchorPoint: "CENTER", anchorFrameType: "SCREEN", xOffset: 0, yOffset: 0, space: 2, ...extra },
  items,
});
const rectOf = (items: LayoutNode[], id: string, isShown = shown) => {
  const a = layoutScreen(items, ui, isShown).auras.find((x) => x.id === id)!;
  return a.visible ? a.rect : null;
};

describe("group layout", () => {
  it("places children relative to the group's centre, offsets y up", () => {
    const items = [group("G", [icon("A"), icon("B", { xOffset: 70, yOffset: 10 })], { xOffset: 100, yOffset: 50 })];
    // The group's centre is at (612, 334).
    expect(rectOf(items, "A")).toEqual({ left: 580, top: 302, width: 64, height: 64 });
    expect(rectOf(items, "B")).toEqual({ left: 650, top: 292, width: 64, height: 64 });
  });

  it("anchors a SCREEN child on the group's CENTER whatever its anchorPoint (WeakAuras.lua:6820-6831)", () => {
    const items = [group("G", [icon("A", { anchorPoint: "TOPLEFT", selfPoint: "TOPLEFT" })])];
    expect(rectOf(items, "A")).toEqual({ left: 512, top: 384, width: 64, height: 64 });
  });

  it("scales the children, their offsets and nested groups by the group's scale", () => {
    const items = [group("G", [group("Inner", [icon("A", { xOffset: 10 })], { xOffset: 20 })], { scale: 2 })];
    // Inner's centre: 512 + 20*2; A: + 10*2, 128 wide.
    expect(rectOf(items, "A")).toEqual({ left: 512 + 40 + 20 - 64, top: 384 - 64, width: 128, height: 128 });
  });

  it("draws a border around the children plus borderOffset while one is shown", () => {
    const items = [group("G", [icon("A"), icon("B", { xOffset: 100 })], { border: true, borderOffset: 4 })];
    const g = layoutScreen(items, ui, shown).groups[0];
    expect(g.border).toEqual({ left: 512 - 32 - 4, top: 384 - 32 - 4, width: 164 + 8, height: 64 + 8 });
    expect(layoutScreen(items, ui, () => false).groups[0].border).toBeNull();
  });

  it("is positioned on a top-level anchor (selfPoint CENTER)", () => {
    const items = [group("G", [icon("A")], { anchorPoint: "TOPLEFT", xOffset: 100, yOffset: -100 })];
    expect(rectOf(items, "A")).toEqual({ left: 100 - 32, top: 100 - 32, width: 64, height: 64 });
  });
});

describe("dynamic group layout", () => {
  it("grows to the right from the group's selfPoint, and hidden children close up", () => {
    const items = [dyn("D", [icon("A"), icon("B", { width: 32, height: 32 }), icon("C")], { grow: "RIGHT", selfPoint: "LEFT" })];
    expect(rectOf(items, "A")).toEqual({ left: 512, top: 352, width: 64, height: 64 });
    expect(rectOf(items, "B")).toEqual({ left: 578, top: 368, width: 32, height: 32 });
    expect(rectOf(items, "C")).toEqual({ left: 612, top: 352, width: 64, height: 64 });
    const withoutA = (a: AuraDocument) => a.id !== "A";
    expect(rectOf(items, "A", withoutA)).toBeNull();
    expect(rectOf(items, "B", withoutA)).toEqual({ left: 512, top: 368, width: 32, height: 32 });
    expect(rectOf(items, "C", withoutA)).toEqual({ left: 546, top: 352, width: 64, height: 64 });
  });

  it("sizes to its shown children and respects the limit", () => {
    const items = [dyn("D", [icon("A"), icon("B"), icon("C")], { grow: "DOWN", selfPoint: "TOP", useLimit: true, limit: 2 })];
    const layout = layoutScreen(items, ui, shown);
    expect(layout.auras.map((a) => a.visible)).toEqual([true, true, false]);
    expect(layout.groups[0].bounds).toEqual({ left: 480, top: 384, width: 64, height: 130 });
  });

  it("ports the growth maths (DynamicGroup.lua:561-1015)", () => {
    const s = (n: number, w = 64, h = 64) => Array.from({ length: n }, () => ({ width: w, height: h }));
    expect(growPositions({ grow: "LEFT", space: 2 }, s(2))).toEqual([[0, 0], [-66, 0]]);
    expect(growPositions({ grow: "UP", space: 2 }, s(2))).toEqual([[0, 0], [0, 66]]);
    expect(growPositions({ grow: "DOWN", space: 0, stagger: 10, align: "CENTER" }, s(3))).toEqual([[-10, 0], [0, -64], [10, -128]]);
    expect(growPositions({ grow: "RIGHT", space: 0, stagger: 4, align: "LEFT" }, s(2))).toEqual([[0, -4], [64, 0]]);
    expect(growPositions({ grow: "HORIZONTAL", space: 2 }, s(2))).toEqual([[-33, 0], [33, 0]]);
    // Center -> Left -> Right: the second child in the middle, then the first left, the third right.
    expect(growPositions({ grow: "HORIZONTAL", space: 0, centerType: "CLR" }, s(3, 10, 10))).toEqual([[0, 0], [-10, 0], [10, 0]]);
    expect(growPositions({ grow: "VERTICAL", space: 0 }, s(2, 10, 10))).toEqual([[0, -5], [0, 5]]);
    const round = (p: [number, number] | null) => p!.map((v) => Math.round(v) + 0);
    const circle = growPositions({ grow: "CIRCLE", radius: 100, constantFactor: "RADIUS", fullCircle: true }, s(4));
    expect(circle.map(round)).toEqual([[100, 0], [0, 100], [-100, 0], [0, -100]]);
    const counter = growPositions({ grow: "COUNTERCIRCLE", radius: 100, constantFactor: "RADIUS", fullCircle: true }, s(4));
    expect(round(counter[1])).toEqual([0, -100]);
    expect(growPositions({ grow: "GRID", gridType: "RD", gridWidth: 2, rowSpace: 1, columnSpace: 1 }, s(3, 10, 10))).toEqual([[0, 0], [11, 0], [0, -11]]);
    expect(growPositions({ grow: "GRID", gridType: "HD", gridWidth: 2, rowSpace: 1, columnSpace: 1 }, s(3, 10, 10))).toEqual([[-5.5, 0], [5.5, 0], [0, -11]]);
    expect(growPositions({ grow: "RIGHT", useLimit: true, limit: 1 }, s(2))).toEqual([[0, 0], null]);
  });

  it("takes the selfPoint the options derive from growth and alignment when a document has none", () => {
    expect(dynamicSelfPoint({ grow: "RIGHT", align: "CENTER" })).toBe("LEFT");
    expect(dynamicSelfPoint({ grow: "DOWN", align: "LEFT" })).toBe("TOPLEFT");
    expect(dynamicSelfPoint({ grow: "GRID", gridType: "LU" })).toBe("BOTTOMRIGHT");
    expect(dynamicSelfPoint({ grow: "CIRCLE" })).toBe("CENTER");
  });
});

describe("modern aura groups (blizzardFlow)", () => {
  it("chain the shown icons one after another from the first one's place", () => {
    const items = [
      group("M", [icon("A", { xOffset: -200 }), icon("B", { xOffset: 50, yOffset: 50 }), icon("C")], {
        blizzardFlow: true,
        blizzardFlowGrowth: "RIGHT",
        blizzardFlowSpacing: 2,
      }),
    ];
    expect(rectOf(items, "A")).toEqual({ left: 280, top: 352, width: 64, height: 64 });
    expect(rectOf(items, "B")).toEqual({ left: 346, top: 352, width: 64, height: 64 });
    const noB = (a: AuraDocument) => a.id !== "B";
    expect(rectOf(items, "C", noB)).toEqual({ left: 346, top: 352, width: 64, height: 64 });
  });
});
