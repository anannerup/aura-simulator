/** Wire types of the spell API (`/api/spells/*`, `/api/icons`), shared by the server and the page. No server code here. */

const ICON_BASE = "https://wow.zamimg.com/images/wow/icons";

/** Image URL of a game icon on Wowhead's image server, by file name (lower case, no extension): 56, 36 or 18 px. */
export function iconNameUrl(name: string, size: "small" | "medium" | "large" = "large"): string {
  return `${ICON_BASE}/${size}/${encodeURIComponent(name)}.jpg`;
}

/** One hit in a name search. Icons come from the game's client data (wago); no network on search. */
export interface SpellSearchHit {
  id: number;
  name: string;
  /** Icon file name, lower case, no extension (e.g. "spell_holy_magicalsentry"). */
  icon: string | null;
  iconUrl: string | null;
}

export interface SpellSearchResult {
  query: string;
  build: string | null;
  /** The most results answered (the request's `limit`, 1-100; 20 by default). */
  limit: number;
  /** How many spells match; more than `results.length` when the limit cut the list (raise it or narrow the query). */
  total: number;
  results: SpellSearchHit[];
}

export type SpellFlag =
  /** The cache has never been synced, so whether the game has the spell is unknown. */
  | "not-synced"
  /** Wowhead knows the ID but the game's spell list (synced build) does not. */
  | "not-in-game"
  /** Wowhead (the game's environment) does not know the ID. */
  | "not-on-wowhead"
  /** Wowhead could not be reached; tooltip missing for now, retried on next lookup. */
  | "wowhead-unavailable"
  /** The game and Wowhead disagree on the spell's name. */
  | "name-mismatch"
  /** The game and Wowhead disagree on the spell's icon. */
  | "icon-mismatch"
  /** No icon known from either source. */
  | "no-icon"
  /** Neither the game nor Wowhead knows the ID. */
  | "unknown";

export type WowheadStatus = "found" | "not_found" | "unavailable" | "not_fetched";

export interface Spell {
  id: number;
  /** True when the game or Wowhead knows the ID. */
  found: boolean;
  /** Best name: the game's, else Wowhead's. */
  name: string | null;
  /** Best icon: the game's, else Wowhead's. Lower-case file name without extension. */
  icon: string | null;
  iconUrl: string | null;
  /** Wowhead tooltip HTML (the game's Wowhead environment), when cached. */
  tooltip: string | null;
  /** Wowhead buff tooltip HTML, when cached. */
  buff: string | null;
  source: {
    name: "wago" | "wowhead" | null;
    icon: "wago" | "wowhead" | null;
    tooltip: "wowhead" | null;
  };
  /** The game's own data from wago.tools for the synced build, or null if the ID isn't in it. */
  inGame: { name: string; icon: string | null; iconFileId: number | null } | null;
  wowhead: { status: WowheadStatus; name: string | null; icon: string | null };
  /** Anything the player should double-check in the game. Empty when everything agrees. */
  flags: SpellFlag[];
}

/** Icon names by FileDataID / spell ID (null when unknown). Keys are the requested IDs. */
export interface IconLookupResult {
  files: Record<string, string | null>;
  spells: Record<string, string | null>;
}

export interface SpellCacheStatus {
  synced: boolean;
  product: string;
  build: string | null;
  syncedAt: string | null;
  spellCount: number;
  spellsWithIcon: number;
  wowhead: { found: number; notFound: number };
}

export interface SyncResult {
  product: string;
  build: string;
  syncedAt: string;
  spellCount: number;
  spellsWithIcon: number;
  durationMs: number;
}
