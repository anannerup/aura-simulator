/** Browser client for the spell cache API (`/api/spells/*`). */
import type { Spell, SpellCacheStatus, SpellSearchResult, SyncResult } from "@/server/spells";

export type { Spell, SpellCacheStatus, SpellFlag, SpellSearchHit, SyncResult } from "@/server/spells";

/** The answer's JSON body. A failed request throws the server's `error`, unless its status is in `answers`. */
async function json<T>(res: Response, answers: number[] = []): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (body !== null && (res.ok || answers.includes(res.status))) return body;
  throw new Error(body?.error ?? `Request failed (HTTP ${res.status})`);
}

export async function searchSpells(q: string, signal?: AbortSignal): Promise<SpellSearchResult> {
  return json(await fetch(`/api/spells/search?${new URLSearchParams({ q, limit: "20" })}`, { signal }));
}

const spellCache = new Map<number, Promise<Spell>>();

/** Full spell info with flags (404 bodies are valid answers: `found: false`). Cached per page. */
export function getSpell(id: number): Promise<Spell> {
  let p = spellCache.get(id);
  if (!p) {
    p = fetch(`/api/spells/${id}`).then((res) => json<Spell>(res, [404]));
    p.catch(() => spellCache.delete(id));
    spellCache.set(id, p);
  }
  return p;
}

export async function getSpellStatus(): Promise<SpellCacheStatus> {
  return json(await fetch("/api/spells/status"));
}

export async function syncSpells(): Promise<SyncResult> {
  const body = await json<SyncResult>(await fetch("/api/spells/sync", { method: "POST" }));
  spellCache.clear();
  return body;
}
