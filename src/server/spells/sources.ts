/**
 * Remote data sources for the spell cache, and each game's spell source.
 *
 * - wago.tools (authoritative client data per product: `wowf` for WoW Forever, `wow_anniversary` for TBC
 *   Anniversary): build list, and DB2 CSV exports SpellName (ID, Name_lang), SpellMisc (SpellID ->
 *   SpellIconFileDataID) and ManifestInterfaceData (FileDataID -> FilePath + FileName for every Interface\ file,
 *   including all of Interface\ICONS). ManifestInterfaceData maps icon FileDataIDs to names without the 150 MB
 *   community listfile.
 * - Wowhead tooltip API in the game's Wowhead environment (Forever has none of its own and uses Classic's):
 *   name, icon and tooltip HTML per spell ID. Fetched one spell at a time, on lookup, never in bulk.
 */

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Where one game's spell database comes from and where it lives. Each game has its own database file. */
export interface SpellSource {
  /** The game this is the spell database of. */
  game: "forever" | "tbc";
  /** wago.tools product whose builds are synced. */
  product: string;
  /** Wowhead tooltip environment: `nether.wowhead.com/<path>/tooltip/spell/<id>?dataEnv=<dataEnv>`. */
  wowhead: { path: string; dataEnv: number };
  /** Database file name in `<repo>/data/`. */
  dbFile: string;
  /** Environment variable that overrides the database path (the e2e server points it at a seeded file). */
  dbPathEnv: string;
}

/** WoW Forever: wago `wowf`, Wowhead Classic (`/classic/`, `dataEnv=4`), `data/spells.sqlite`. */
export const FOREVER_SPELLS: SpellSource = {
  game: "forever",
  product: "wowf",
  wowhead: { path: "classic", dataEnv: 4 },
  dbFile: "spells.sqlite",
  dbPathEnv: "SPELL_DB_PATH",
};

/** TBC Anniversary: wago `wow_anniversary`, Wowhead TBC (`/tbc/`, `dataEnv=5`), `data/spells-tbc.sqlite`. */
export const TBC_SPELLS: SpellSource = {
  game: "tbc",
  product: "wow_anniversary",
  wowhead: { path: "tbc", dataEnv: 5 },
  dbFile: "spells-tbc.sqlite",
  dbPathEnv: "TBC_SPELL_DB_PATH",
};

const WAGO = "https://wago.tools";

function wagoCsvUrl(table: string, build: string): string {
  return `${WAGO}/db2/${table}/csv?build=${encodeURIComponent(build)}`;
}

function wowheadTooltipUrl(source: SpellSource, id: number): string {
  return `https://nether.wowhead.com/${source.wowhead.path}/tooltip/spell/${id}?dataEnv=${source.wowhead.dataEnv}&locale=0`;
}

async function getOk(fetchFn: FetchFn, url: string): Promise<Response> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  return res;
}

/** Latest build version of a wago.tools product, e.g. "1.60.1.70790" for `wowf`. */
export async function fetchLatestBuild(fetchFn: FetchFn, product: string): Promise<string> {
  const res = await getOk(fetchFn, `${WAGO}/api/builds/latest`);
  const data = (await res.json()) as Record<string, { version?: string } | undefined>;
  const version = data[product]?.version;
  if (!version) throw new Error(`wago.tools lists no "${product}" build`);
  return version;
}

export async function fetchWagoCsv(fetchFn: FetchFn, table: string, build: string): Promise<string> {
  const res = await getOk(fetchFn, wagoCsvUrl(table, build));
  return res.text();
}

export type WowheadSpell =
  | { status: "found"; name: string; icon: string | null; tooltip: string | null; buff: string | null }
  | { status: "not_found" };

/**
 * Fetches one spell from Wowhead's tooltip API in the source's environment. Returns `not_found` when Wowhead
 * answers with an error body (unknown or out-of-range ID). Throws on network or server errors, so the caller can
 * avoid caching a transient failure.
 */
export async function fetchWowheadSpell(fetchFn: FetchFn, source: SpellSource, id: number): Promise<WowheadSpell> {
  const res = await fetchFn(wowheadTooltipUrl(source, id));
  if (res.status >= 500) throw new Error(`Wowhead tooltip ${id}: HTTP ${res.status}`);
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new Error(`Wowhead tooltip ${id}: HTTP ${res.status}, body is not JSON`);
  }
  if (body.error || typeof body.name !== "string") {
    if (res.status === 404 || res.ok) return { status: "not_found" };
    throw new Error(`Wowhead tooltip ${id}: HTTP ${res.status}`);
  }
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  return {
    status: "found",
    name: body.name,
    icon: str(body.icon),
    tooltip: str(body.tooltip),
    buff: str(body.buff),
  };
}
