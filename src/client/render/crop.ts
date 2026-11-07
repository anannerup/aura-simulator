/**
 * What the render page crops to: the box an aura (or a group, with everything in it) takes on the game screen, in
 * UIParent units. Measured from what was drawn, so auto-sized regions (text) and sub elements reaching outside their
 * region (texts anchored OUTER_*, borders with an offset, textures) count at their real size; an aura that draws
 * nothing in the situation takes the place the layout gives it.
 */
import type { ScreenLayout } from "@/render/group/layout";
import type { Box } from "@/render/screen/geometry";

function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * A region's sub elements that count towards what it draws: every one but glows (which reach a size-dependent way
 * out, by their own drawing) and those hidden in the situation.
 */
const DRAWN_SUB_ELEMENTS = '[data-subregion]:not([data-subregion="subglow"]):not([data-visible="false"])';

/**
 * The bounds of what the auras `ids` draw inside `screen` (the element UIParent units start at, drawn at `cssPerUnit`
 * CSS pixels per unit): their regions, their sub elements (texts at their real size, borders, textures, ticks) and
 * group borders; null when none of them is drawn. Glows and text outlines and shadows reaching further don't count:
 * pictures need padding for those.
 */
export function drawnBounds(screen: HTMLElement, ids: ReadonlySet<string>, cssPerUnit: number): Box | null {
  const origin = screen.getBoundingClientRect();
  const boxes: Box[] = [];
  const add = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    boxes.push({
      left: (r.left - origin.left) / cssPerUnit,
      top: (r.top - origin.top) / cssPerUnit,
      width: r.width / cssPerUnit,
      height: r.height / cssPerUnit,
    });
  };
  for (const el of screen.querySelectorAll<HTMLElement>("[data-aura-id], [data-group-border]")) {
    const id = el.dataset.auraId ?? el.dataset.groupBorder;
    if (id === undefined || !ids.has(id)) continue;
    add(el);
    if (el.dataset.auraId !== undefined) el.querySelectorAll(DRAWN_SUB_ELEMENTS).forEach(add);
  }
  return union(boxes);
}

/** Where the layout puts the auras `ids`, shown or not (their rects, else their groups' frames); null if nowhere. */
export function layoutBounds(layout: ScreenLayout, ids: ReadonlySet<string>): Box | null {
  const leaves = layout.auras.filter((a) => ids.has(a.id)).map((a) => a.rect);
  return union(leaves) ?? union(layout.groups.filter((g) => ids.has(g.id)).map((g) => g.frame));
}
