/**
 * What the render page crops to: the box an aura (or a group, with everything in it) takes on the game screen, in
 * UIParent units. Measured from what was drawn, so auto-sized regions (text) count at their real size; an aura that
 * draws nothing in the situation takes the place the layout gives it.
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
 * The drawn regions and group borders of the auras `ids` inside `screen` (the element UIParent units start at, drawn
 * at `cssPerUnit` CSS pixels per unit), or null when none of them is drawn. Glows and shadows reaching outside a
 * region don't count.
 */
export function drawnBounds(screen: HTMLElement, ids: ReadonlySet<string>, cssPerUnit: number): Box | null {
  const origin = screen.getBoundingClientRect();
  const boxes: Box[] = [];
  for (const el of screen.querySelectorAll<HTMLElement>("[data-aura-id], [data-group-border]")) {
    const id = el.dataset.auraId ?? el.dataset.groupBorder;
    if (id === undefined || !ids.has(id)) continue;
    const r = el.getBoundingClientRect();
    boxes.push({
      left: (r.left - origin.left) / cssPerUnit,
      top: (r.top - origin.top) / cssPerUnit,
      width: r.width / cssPerUnit,
      height: r.height / cssPerUnit,
    });
  }
  return union(boxes);
}

/** Where the layout puts the auras `ids`, shown or not (their rects, else their groups' frames); null if nowhere. */
export function layoutBounds(layout: ScreenLayout, ids: ReadonlySet<string>): Box | null {
  const leaves = layout.auras.filter((a) => ids.has(a.id)).map((a) => a.rect);
  return union(leaves) ?? union(layout.groups.filter((g) => ids.has(g.id)).map((g) => g.frame));
}
