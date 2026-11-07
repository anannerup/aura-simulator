/**
 * Remote data sources for the spell cache.
 *
 * - wago.tools (authoritative WoW Forever data, product `wowf`): build list, and DB2 CSV
 *   exports SpellName (ID, Name_lang), SpellMisc (SpellID -> SpellIconFileDataID) and
 *   ManifestInterfaceData (FileDataID -> FilePath + FileName for every Interface\ file,
 *   including all of Interface\ICONS). ManifestInterfaceData is ~9 MB and maps icon
 *   FileDataIDs to names without the 150 MB community listfile.
 * - Wowhead tooltip API (Classic data; Wowhead has no Forever environment): name, icon and
 *   tooltip HTML per spell ID. Fetched one spell at a time, on lookup, never in bulk.
 */

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export const FOREVER_PRODUCT = "wowf";
const WAGO = "https://wago.tools";
const WOWHEAD_TOOLTIP = "https://nether.wowhead.com/classic/tooltip/spell";
function wagoCsvUrl(table: string, build: string): string {
  return `${WAGO}/db2/${table}/csv?build=${encodeURIComponent(build)}`;
}

function wowheadTooltipUrl(id: number): string {
  return `${WOWHEAD_TOOLTIP}/${id}?dataEnv=4&locale=0`;
}

async function getOk(fetchFn: FetchFn, url: string): Promise<Response> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  return res;
}

/** Latest WoW Forever build version, e.g. "1.60.1.70790". */
export async function fetchLatestForeverBuild(fetchFn: FetchFn): Promise<string> {
  const res = await getOk(fetchFn, `${WAGO}/api/builds/latest`);
  const data = (await res.json()) as Record<string, { version?: string } | undefined>;
  const version = data[FOREVER_PRODUCT]?.version;
  if (!version) throw new Error(`wago.tools lists no "${FOREVER_PRODUCT}" build`);
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
 * Fetches one spell from Wowhead's tooltip API. Returns `not_found` when Wowhead answers
 * with an error body (unknown or out-of-range ID). Throws on network or server errors, so
 * the caller can avoid caching a transient failure.
 */
export async function fetchWowheadSpell(fetchFn: FetchFn, id: number): Promise<WowheadSpell> {
  const res = await fetchFn(wowheadTooltipUrl(id));
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
