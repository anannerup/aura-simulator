/** Browser client for the spell cache API (`/api/spells/*`). */
import type { Spell, SpellCacheStatus, SpellFlag, SpellSearchResult, SyncResult } from "@/server/spells";

export type { Spell, SpellCacheStatus, SpellFlag, SpellSearchHit, SyncResult } from "@/server/spells";

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok && body.error) throw new Error(body.error);
  return body;
}

export async function searchSpells(q: string, signal?: AbortSignal): Promise<SpellSearchResult> {
  const res = await fetch(`/api/spells/search?${new URLSearchParams({ q, limit: "20" })}`, { signal });
  return json(res);
}

const spellCache = new Map<number, Promise<Spell>>();

/** Full spell info with flags (404 bodies are valid answers: `found: false`). Cached per page. */
export function getSpell(id: number): Promise<Spell> {
  let p = spellCache.get(id);
  if (!p) {
    p = fetch(`/api/spells/${id}`).then((res) => json<Spell>(res));
    p.catch(() => spellCache.delete(id));
    spellCache.set(id, p);
  }
  return p;
}

export async function getSpellStatus(): Promise<SpellCacheStatus> {
  return json(await fetch("/api/spells/status"));
}

export async function syncSpells(): Promise<SyncResult> {
  const res = await fetch("/api/spells/sync", { method: "POST" });
  const body = await json<SyncResult>(res);
  if (!res.ok) throw new Error(`Sync failed (HTTP ${res.status})`);
  spellCache.clear();
  return body;
}

/** Flags shown as warnings, with plain-language explanations. Others are informational only. */
export const FLAG_TEXT: Partial<Record<SpellFlag, { label: string; tooltip: string }>> = {
  unknown: {
    label: "Unknown",
    tooltip: "Neither WoW Forever's spell list nor Wowhead knows this spell ID. Check that the ID is right.",
  },
  "not-in-forever": {
    label: "Not in Forever",
    tooltip:
      "Wowhead knows this spell, but WoW Forever's spell list doesn't. The aura may never trigger in the game; check the ID in the game.",
  },
  "not-on-wowhead": {
    label: "Not on Wowhead",
    tooltip: "WoW Forever has this spell, but Wowhead (Classic) doesn't, so there's no tooltip to compare against. Double-check it in the game.",
  },
  "name-mismatch": {
    label: "Name differs",
    tooltip: "WoW Forever and Wowhead give this spell different names. Make sure it's the spell you mean.",
  },
  "icon-mismatch": {
    label: "Icon differs",
    tooltip: "WoW Forever and Wowhead show different icons for this spell. The preview uses Forever's icon.",
  },
  "no-icon": {
    label: "No icon",
    tooltip: "No icon is known for this spell, so the preview shows a question mark.",
  },
  "not-synced": {
    label: "Not synced",
    tooltip: "The spell list hasn't been downloaded yet, so it's unknown whether WoW Forever has this spell. Sync spells first.",
  },
  "wowhead-unavailable": {
    label: "Wowhead offline",
    tooltip: "Wowhead couldn't be reached, so the tooltip is missing for now. It's retried next time.",
  },
};

/** Wowhead tooltip HTML as plain text lines (never inserted as HTML). */
export function tooltipLines(html: string | null): string[] {
  if (!html || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];
  let line = "";
  const breakLine = () => {
    if (line.trim()) lines.push(line.trim().replace(/\s+/g, " "));
    line = "";
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      line += node.textContent ?? "";
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "br") return breakLine();
    const block = ["div", "table", "tr", "p"].includes(tag);
    if (block) breakLine();
    if ((tag === "td" || tag === "th") && line.trim()) line += "   ";
    node.childNodes.forEach(walk);
    if (block) breakLine();
  };
  doc.body.childNodes.forEach(walk);
  breakLine();
  return lines;
}
