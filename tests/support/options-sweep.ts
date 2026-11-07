/** Shared by the tab sweeps (seam A in Vitest, seam B in Playwright): walks an option tree and picks test values. */
import type { OptionNode } from "@/core";

/** Every node of the tree, pre-order. */
export function walkOptions(node: OptionNode): OptionNode[] {
  return [node, ...(node.args ?? []).flatMap(walkOptions)];
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A value different from the option's current one, of the kind its type takes; undefined when there is none. */
export function sweepValue(node: OptionNode): unknown {
  switch (node.type) {
    case "toggle":
      return !(node.value !== undefined && node.value !== null && node.value !== false);
    case "range": {
      const min = finite(node.softMin) ? node.softMin : finite(node.min) ? node.min : 0;
      const max = finite(node.softMax) ? node.softMax : finite(node.max) ? node.max : 100;
      const step = finite(node.step) && node.step > 0 ? node.step : 0;
      let v = min + (max - min) * 0.37;
      if (step) v = min + Math.round((v - min) / step) * step;
      if (finite(node.max)) v = Math.min(node.max, v);
      if (finite(node.min)) v = Math.max(node.min, v);
      return v === node.value ? (finite(node.max) && v + (step || 1) <= node.max ? v + (step || 1) : undefined) : v;
    }
    case "select": {
      const other = (node.values ?? []).find(([k]) => k !== node.value);
      return other ? other[0] : undefined;
    }
    case "multiselect": {
      const values = node.values ?? [];
      if (values.length === 0) return undefined;
      const current = new Map((Array.isArray(node.value) ? (node.value as [unknown, boolean][]) : []).map(([k, v]) => [k, v]));
      const key = values[0][0];
      return [key, !current.get(key)];
    }
    case "color":
      return [0.2, 0.4, 0.6, 0.8];
    case "input": {
      if (node.control === "WeakAurasInputFocus") return "1459";
      const current = typeof node.value === "number" ? node.value : Number(node.value);
      if (node.value !== undefined && node.value !== "" && Number.isFinite(current)) return String(current + 1);
      return node.multiline ? "-- swept" : "Swept";
    }
  }
  return undefined;
}
