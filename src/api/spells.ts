/** Wire types of the spell API (`/api/spells/*`, `/api/icons`), shared by the server and the page. No server code here. */

/** One hit in a name search. Icons come from Forever data (wago); no network on search. */
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
  results: SpellSearchHit[];
}

export type SpellFlag =
  /** The cache has never been synced, so Forever membership is unknown. */
  | "not-synced"
  /** Wowhead knows the ID but Forever's spell list (current build) does not. */
  | "not-in-forever"
  /** Wowhead (Classic data) does not know the ID. */
  | "not-on-wowhead"
  /** Wowhead could not be reached; tooltip missing for now, retried on next lookup. */
  | "wowhead-unavailable"
  /** Forever and Wowhead disagree on the spell's name. */
  | "name-mismatch"
  /** Forever and Wowhead disagree on the spell's icon. */
  | "icon-mismatch"
  /** No icon known from either source. */
  | "no-icon"
  /** Neither Forever nor Wowhead knows the ID. */
  | "unknown";

export type WowheadStatus = "found" | "not_found" | "unavailable" | "not_fetched";

export interface Spell {
  id: number;
  /** True when Forever or Wowhead knows the ID. */
  found: boolean;
  /** Best name: Forever's, else Wowhead's. */
  name: string | null;
  /** Best icon: Forever's, else Wowhead's. Lower-case file name without extension. */
  icon: string | null;
  iconUrl: string | null;
  /** Wowhead tooltip HTML (Classic data), when cached. */
  tooltip: string | null;
  /** Wowhead buff tooltip HTML, when cached. */
  buff: string | null;
  source: {
    name: "wago" | "wowhead" | null;
    icon: "wago" | "wowhead" | null;
    tooltip: "wowhead" | null;
  };
  /** Forever data from wago.tools for the synced build, or null if the ID isn't in it. */
  forever: { name: string; icon: string | null; iconFileId: number | null } | null;
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
