/** Browser client for the spell cache API (`/api/spells/*`). */
import type { Spell, SpellCacheStatus, SpellSearchResult, SyncResult } from "@/api/spells";
import { fetchJson } from "@/lib/fetch-json";

export type { Spell, SpellCacheStatus, SpellFlag, SpellSearchHit, SyncResult } from "@/api/spells";

export async function searchSpells(q: string, signal?: AbortSignal): Promise<SpellSearchResult> {
  return fetchJson(`/api/spells/search?${new URLSearchParams({ q, limit: "20" })}`, { signal });
}

const spellCache = new Map<number, Promise<Spell>>();

/** Full spell info with flags (404 bodies are valid answers: `found: false`). Cached per page. */
export function getSpell(id: number): Promise<Spell> {
  let p = spellCache.get(id);
  if (!p) {
    p = fetchJson<Spell>(`/api/spells/${id}`, { answers: [404] });
    p.catch(() => spellCache.delete(id));
    spellCache.set(id, p);
  }
  return p;
}

export async function getSpellStatus(): Promise<SpellCacheStatus> {
  return fetchJson("/api/spells/status");
}

export async function syncSpells(): Promise<SyncResult> {
  const body = await fetchJson<SyncResult>("/api/spells/sync", { method: "POST" });
  spellCache.clear();
  return body;
}
