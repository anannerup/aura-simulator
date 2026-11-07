/** Browser client for a game's spell cache API (`/api/<game>/spells/*`), given to the spell picker by context. */
import { createContext, useContext } from "react";
import type { Spell, SpellCacheStatus, SpellSearchResult, SyncResult } from "@/api/spells";
import { fetchJson } from "@/lib/fetch-json";

export type { Spell, SpellCacheStatus, SpellFlag, SpellSearchHit, SyncResult } from "@/api/spells";

/** The game whose spells these are, in the picker's words. */
export interface SpellGame {
  /** "WoW Forever" */
  name: string;
  /** "Forever", as in "Not in Forever" */
  shortName: string;
  /** Wowhead's environment the tooltips come from: "Classic" */
  wowhead: string;
}

export interface SpellApi {
  readonly game: SpellGame;
  search(q: string, signal?: AbortSignal): Promise<SpellSearchResult>;
  /** Full spell info with flags (404 bodies are valid answers: `found: false`). Cached per page. */
  get(id: number): Promise<Spell>;
  status(): Promise<SpellCacheStatus>;
  sync(): Promise<SyncResult>;
}

/** The spell API of `game` under `base` (e.g. "/api/forever/spells"). */
export function createSpellApi(base: string, game: SpellGame): SpellApi {
  const spellCache = new Map<number, Promise<Spell>>();
  return {
    game,
    search: (q, signal) => fetchJson(`${base}/search?${new URLSearchParams({ q, limit: "20" })}`, { signal }),
    get(id) {
      let p = spellCache.get(id);
      if (!p) {
        p = fetchJson<Spell>(`${base}/${id}`, { answers: [404] });
        p.catch(() => spellCache.delete(id));
        spellCache.set(id, p);
      }
      return p;
    },
    status: () => fetchJson(`${base}/status`),
    async sync() {
      const body = await fetchJson<SyncResult>(`${base}/sync`, { method: "POST" });
      spellCache.clear();
      return body;
    },
  };
}

export const SpellApiContext = createContext<SpellApi | null>(null);

/** The game's spell API (the page provides it). */
export function useSpellApi(): SpellApi {
  const api = useContext(SpellApiContext);
  if (!api) throw new Error("No SpellApiContext: the page must provide its game's spell API");
  return api;
}
