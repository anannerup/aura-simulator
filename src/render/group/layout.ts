/**
 * Where every aura of a workspace sits on the mock screen: top-level items at their anchors, group children
 * relative to their group, dynamic group children laid out by the group's growth.
 *
 * All rects are in UIParent units, y down (see `../screen/geometry.ts`); WoW offsets are y up.
 *
 * Sources (Musca Auras v1.15.0):
 * - A group is a 2x2 frame (Group.lua:41-43) whose selfPoint is CENTER, or BOTTOMLEFT with
 *   `information.groupOffset`, or its own selfPoint for a framed modern group (Group.lua:99-107, :145-153).
 * - A child anchored to "Screen/Parent Group" (SCREEN) is placed on its parent group's CENTER whatever its
 *   anchorPoint (Private.AnchorFrame, WeakAuras.lua:6820-6831; GetAnchorFrame returns the parent, :6676).
 * - A group's scale (0 < scale <= 10, else 1) scales its frame, its offsets and everything inside it
 *   (Group.lua:158, groupRect :125-142 multiplies a sub group's offsets by its scale; DynamicGroup.lua:1659).
 * - A dynamic group puts each shown child's selfPoint (the group's selfPoint) at the group's selfPoint plus the
 *   growth's position (DynamicGroup.lua:1458-1468, :1191); hidden children are not in the list the growth
 *   lays out, so the rest close up. Its size is the bounding box of its shown children (Resize, :1583-1655).
 * - Borders: a group's border surrounds its children's rects plus `borderOffset`, and only while one of them is
 *   shown and no child is a dynamic group (Group.lua:177-235); a dynamic group's surrounds its shown children
 *   (:1630-1636), not with anchor-per-unit (:1099).
 */
import { field, num, type AuraDocument } from "@/core";
import { anchorFraction, anchorFrameFor, type AnchorFrame, type Rect, type UiParent } from "../screen/geometry";
import { dynamicSelfPoint, growPositions, type Size } from "./grow";

export interface LayoutNode {
  aura: AuraDocument;
  items?: LayoutNode[];
}

export interface PlacedAura {
  id: string;
  aura: AuraDocument;
  rect: Rect;
  /** Effective scale relative to UIParent (a group's scale applies to its children). */
  scale: number;
  visible: boolean;
}

export interface PlacedGroup {
  id: string;
  aura: AuraDocument;
  kind: "group" | "dynamicgroup";
  /** Bounding box of the shown children; null when none is shown. */
  bounds: Rect | null;
  /** The group's own frame (a group's 2x2 frame; a dynamic group's selfPoint as a zero-size rect). */
  frame: Rect;
  /** The border/backdrop rect when the game draws one. */
  border: Rect | null;
  scale: number;
}

export interface StageLayout {
  /** Leaf auras in draw order (pre-order). */
  auras: PlacedAura[];
  groups: PlacedGroup[];
  /** Stand-ins for anchor frames the simulator doesn't draw. */
  standIns: AnchorFrame[];
}

const idOf = (a: AuraDocument) => (typeof a.id === "string" ? a.id : "");
/** `data.scale and data.scale > 0 and data.scale <= 10 and data.scale or 1` */
const scaleOf = (a: AuraDocument) => {
  const s = num(a.scale, 1);
  return s > 0 && s <= 10 ? s : 1;
};

function pointOf(rect: Rect, point: unknown): [number, number] {
  const [fx, fy] = anchorFraction(point);
  return [rect.x + rect.width * fx, rect.y + rect.height * fy];
}

/** The rect whose `point` lies at `at`. */
function rectAt(point: unknown, at: [number, number], width: number, height: number): Rect {
  const [fx, fy] = anchorFraction(point);
  return { x: at[0] - width * fx, y: at[1] - height * fy, width, height };
}

function union(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.width));
  const y2 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function grow(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by };
}

/** A parent frame children are placed in: the point SCREEN children anchor to, and the effective scale. */
interface Parent {
  center: [number, number];
  scale: number;
}

/** Where a region's anchor is: its parent group's CENTER, or (top level, or not anchored to the group) its frame. */
function anchorFor(aura: AuraDocument, parent: Parent | null, ui: UiParent, standIns: AnchorFrame[]): { at: [number, number]; scale: number } {
  const type = aura.anchorFrameType;
  if (parent && (type === undefined || type === "SCREEN")) return { at: parent.center, scale: parent.scale };
  const frame = anchorFrameFor(aura, ui);
  if (frame.label && !standIns.some((s) => s.label === frame.label)) standIns.push(frame);
  return { at: pointOf(frame.rect, frame.anchorPoint), scale: 1 };
}

/** Lays out every item. `isShown(aura)` says whether a leaf aura is shown in the current situation. */
export function layoutStage(items: LayoutNode[], ui: UiParent, isShown: (aura: AuraDocument) => boolean): StageLayout {
  const out: StageLayout = { auras: [], groups: [], standIns: [] };

  const placeLeaf = (aura: AuraDocument, parent: Parent | null): PlacedAura => {
    const { at, scale } = anchorFor(aura, parent, ui, out.standIns);
    const pos: [number, number] = [at[0] + num(aura.xOffset, 0) * scale, at[1] - num(aura.yOffset, 0) * scale];
    const rect = rectAt(aura.selfPoint, pos, num(aura.width, 64) * scale, num(aura.height, 64) * scale);
    const placed = { id: idOf(aura), aura, rect, scale, visible: isShown(aura) };
    out.auras.push(placed);
    return placed;
  };

  /** Places a node; returns the leaves it placed (for bounds). */
  const place = (node: LayoutNode, parent: Parent | null): PlacedAura[] => {
    const aura = node.aura;
    if (!node.items) return [placeLeaf(aura, parent)];
    const { at, scale: parentScale } = anchorFor(aura, parent, ui, out.standIns);
    const scale = parentScale * scaleOf(aura);
    const pos: [number, number] = [at[0] + num(aura.xOffset, 0) * scale, at[1] - num(aura.yOffset, 0) * scale];

    if (aura.regionType === "dynamicgroup") return placeDynamic(node, pos, scale);

    const flowFramed = aura.blizzardFlow === true && typeof aura.blizzardFlowFrames === "string" && aura.blizzardFlowFrames !== "";
    const groupOffset = field(aura.information, "groupOffset") === true;
    const selfPoint = flowFramed ? (aura.selfPoint ?? "CENTER") : groupOffset ? "BOTTOMLEFT" : "CENTER";
    const frame = rectAt(selfPoint, pos, 2 * scale, 2 * scale);
    const me: Parent = { center: pointOf(frame, "CENTER"), scale };
    const leaves: PlacedAura[] = [];
    const entry: PlacedGroup = { id: idOf(aura), aura, kind: "group", bounds: null, frame, border: null, scale };
    out.groups.push(entry);
    for (const child of node.items) leaves.push(...place(child, me));
    if (aura.blizzardFlow === true && !flowFramed) chainFlow(aura, node.items, leaves);
    const shown = leaves.filter((l) => l.visible);
    entry.bounds = union(shown.map((l) => l.rect));
    const hasDynamicChild = node.items.some((c) => c.aura.regionType === "dynamicgroup");
    const all = union(leaves.map((l) => l.rect));
    if (aura.border === true && !hasDynamicChild && shown.length > 0 && all) {
      entry.border = grow(all, num(aura.borderOffset, 4) * scale);
    }
    return leaves;
  };

  const placeDynamic = (node: LayoutNode, origin: [number, number], scale: number): PlacedAura[] => {
    const aura = node.aura;
    const selfPoint = typeof aura.selfPoint === "string" ? aura.selfPoint : dynamicSelfPoint(aura);
    const entry: PlacedGroup = {
      id: idOf(aura),
      aura,
      kind: "dynamicgroup",
      bounds: null,
      frame: { x: origin[0], y: origin[1], width: 0, height: 0 },
      border: null,
      scale,
    };
    out.groups.push(entry);
    // Dynamic groups hold no groups (the options don't allow it); a stray one is placed like a plain child.
    const leaves: PlacedAura[] = [];
    const shown: PlacedAura[] = [];
    for (const child of node.items ?? []) {
      if (child.items) {
        leaves.push(...place(child, { center: origin, scale }));
        continue;
      }
      const placed: PlacedAura = {
        id: idOf(child.aura),
        aura: child.aura,
        rect: rectAt(selfPoint, origin, 0, 0),
        scale,
        visible: isShown(child.aura),
      };
      out.auras.push(placed);
      leaves.push(placed);
      if (placed.visible) shown.push(placed);
    }
    // Sorting: "none" is by index (DynamicGroup.lua:325-330); the time-based sorts fall back to the index when the
    // times are equal (:331-371), as they are in the preview; custom sorts can't run here.
    const sizes: Size[] = shown.map((p) => ({ width: num(p.aura.width, 64), height: num(p.aura.height, 64) }));
    const positions = growPositions(aura, sizes);
    shown.forEach((p, i) => {
      const pos = positions[i];
      if (!pos) {
        p.visible = false;
        return;
      }
      const at: [number, number] = [origin[0] + pos[0] * scale, origin[1] - pos[1] * scale];
      p.rect = rectAt(selfPoint, at, sizes[i].width * scale, sizes[i].height * scale);
    });
    entry.bounds = union(leaves.filter((l) => l.visible).map((l) => l.rect));
    if (aura.border === true && aura.useAnchorPerUnit !== true && entry.bounds) {
      entry.border = grow(entry.bounds, num(aura.borderOffset, 4) * scale);
    }
    return leaves;
  };

  for (const node of items) place(node, null);
  return out;
}

/**
 * Musca's modern aura groups (`blizzardFlow`, SecretAuraFlow.lua): the shown icons and bars of the group are
 * chained one after another in `blizzardFlowGrowth`, the first at its own place (ChainRegions, :410-431), each next
 * one a step of its predecessor's size plus `blizzardFlowSpacing` further (SetFlowEnd, :244-262; Growth:Step,
 * SecretAuraAnchor.lua:61). Centered growths centre the chain on the first region (shadow chain, :363-405).
 * An approximation: the game chains native aura containers, which can hold several instances each.
 */
function chainFlow(group: AuraDocument, children: LayoutNode[], leaves: PlacedAura[]) {
  const key = typeof group.blizzardFlowGrowth === "string" ? group.blizzardFlowGrowth : "RIGHT";
  const spacing = num(group.blizzardFlowSpacing, 2);
  const signs: Record<string, [number, number]> = {
    RIGHT: [1, 0],
    LEFT: [-1, 0],
    DOWN: [0, 1],
    UP: [0, -1],
    CENTER_HORIZONTAL: [1, 0],
    CENTER_VERTICAL: [0, 1],
  };
  const [sx, sy] = signs[key] ?? signs.RIGHT;
  const direct = new Set(children.filter((c) => !c.items).map((c) => c.aura));
  const chain = leaves.filter(
    (l) => direct.has(l.aura) && l.visible && (l.aura.regionType === "icon" || l.aura.regionType === "aurabar"),
  );
  if (chain.length < 2 && !key.startsWith("CENTER")) return;
  if (chain.length === 0) return;
  const first = chain[0].rect;
  let x = sx < 0 ? first.x + first.width : first.x;
  let y = sy < 0 ? first.y + first.height : first.y;
  const placed: Rect[] = [];
  for (const l of chain) {
    const r = l.rect;
    const rx = sx < 0 ? x - r.width : x;
    const ry = sy < 0 ? y - r.height : y;
    placed.push({ x: rx, y: ry, width: r.width, height: r.height });
    x += sx * (r.width + spacing);
    y += sy * (r.height + spacing);
  }
  if (key.startsWith("CENTER")) {
    const total = union(placed)!;
    const dx = sx ? first.x + first.width / 2 - (total.x + total.width / 2) : 0;
    const dy = sy ? first.y + first.height / 2 - (total.y + total.height / 2) : 0;
    for (const p of placed) {
      p.x += dx;
      p.y += dy;
    }
  }
  chain.forEach((l, i) => (l.rect = placed[i]));
}
