import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseCsvRecords } from "./csv";
import {
  fetchLatestBuild,
  fetchWagoCsv,
  fetchWowheadSpell,
  type FetchFn,
  type SpellSource,
} from "./sources";
import { iconNameUrl, type IconLookupResult, type Spell, type SpellCacheStatus, type SpellFlag, type SpellSearchHit, type SpellSearchResult, type SyncResult, type WowheadStatus } from "@/api/spells";

export type { IconLookupResult, Spell, SpellCacheStatus, SpellFlag, SpellSearchHit, SpellSearchResult, SyncResult, WowheadStatus };

export interface SpellCacheOptions {
  /** The game's spell source: wago product and Wowhead environment. */
  source: SpellSource;
  /** SQLite file path, or ":memory:". One database per game. */
  dbPath: string;
  /** Injected for tests; defaults to global fetch. */
  fetch?: FetchFn;
  now?: () => Date;
}

export interface LookupOptions {
  /** Fetch from Wowhead when nothing is cached for the ID (default true). */
  fetchWowhead?: boolean;
}

export interface SpellCache {
  /** Pulls the spell list and icon names for a build of the source's product (latest by default) from wago.tools. */
  sync(options?: { build?: string }): Promise<SyncResult>;
  /** Name search (case-insensitive; every word must occur), best matches first. A numeric query also matches the ID. */
  search(query: string, options?: { limit?: number }): SpellSearchResult;
  /** Full spell info. Fetches and caches Wowhead's tooltip on first lookup. */
  lookup(id: number, options?: LookupOptions): Promise<Spell>;
  /**
   * Icon names (lower case, no extension) for Interface\\ICONS FileDataIDs and for spell IDs.
   * Spells use the game's icon, else a cached Wowhead icon. No network.
   */
  icons(request: { files?: number[]; spells?: number[] }): IconLookupResult;
  status(): SpellCacheStatus;
  close(): void;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Internal/obsolete spell names rank below real ones with the same match quality. */
const INTERNAL_NAME = /\((old|dnt|test|unused)\)|\[(dnt|test)\]|^(qa|zz|test)|deprecated/i;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS spells (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL,
  internal INTEGER NOT NULL,
  icon_file_id INTEGER,
  icon TEXT
);
CREATE TABLE IF NOT EXISTS wowhead (
  id INTEGER PRIMARY KEY,
  status TEXT NOT NULL,
  name TEXT,
  icon TEXT,
  tooltip TEXT,
  buff TEXT,
  fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS icons (
  file_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
`;

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Icon name as Wowhead uses it: lower-case file name without extension. */
function iconName(fileName: string): string {
  return fileName.replace(/\.blp$/i, "").toLowerCase();
}

export function createSpellCache(options: SpellCacheOptions): SpellCache {
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => new Date());
  if (options.dbPath !== ":memory:") mkdirSync(path.dirname(options.dbPath), { recursive: true });
  const db = new DatabaseSync(options.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  const { source } = options;

  const getMeta = (key: string): string | null => {
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  };
  // One database per game: refuse a file another game's sync filled.
  const storedProduct = getMeta("product");
  if (storedProduct !== null && storedProduct !== source.product) {
    db.close();
    throw new Error(`${options.dbPath} holds ${storedProduct} spells, not ${source.product}`);
  }
  const setMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const getSpellRow = db.prepare("SELECT id, name, icon_file_id, icon FROM spells WHERE id = ?");
  const getWowheadRow = db.prepare("SELECT status, name, icon, tooltip, buff FROM wowhead WHERE id = ?");
  const putWowheadRow = db.prepare(
    `INSERT INTO wowhead (id, status, name, icon, tooltip, buff, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, name = excluded.name, icon = excluded.icon,
       tooltip = excluded.tooltip, buff = excluded.buff, fetched_at = excluded.fetched_at`,
  );

  let syncInFlight: Promise<SyncResult> | null = null;
  const wowheadInFlight = new Map<number, Promise<void>>();

  async function doSync(build?: string): Promise<SyncResult> {
    const started = Date.now();
    const version = build ?? (await fetchLatestBuild(fetchFn, source.product));
    const [spellNameCsv, spellMiscCsv, manifestCsv] = await Promise.all([
      fetchWagoCsv(fetchFn, "SpellName", version),
      fetchWagoCsv(fetchFn, "SpellMisc", version),
      fetchWagoCsv(fetchFn, "ManifestInterfaceData", version),
    ]);

    const iconByFileId = new Map<number, string>();
    for (const r of parseCsvRecords(manifestCsv)) {
      if (!/^interface[\\/]icons[\\/]?$/i.test(r.FilePath ?? "")) continue;
      iconByFileId.set(Number(r.ID), iconName(r.FileName));
    }

    // SpellMisc can hold several rows per spell (per difficulty); prefer DifficultyID 0.
    const iconFileBySpell = new Map<number, { fileId: number; difficulty: number }>();
    for (const r of parseCsvRecords(spellMiscCsv)) {
      const spellId = Number(r.SpellID);
      const fileId = Number(r.SpellIconFileDataID);
      const difficulty = Number(r.DifficultyID) || 0;
      if (!spellId || !fileId) continue;
      const prev = iconFileBySpell.get(spellId);
      if (!prev || (prev.difficulty !== 0 && difficulty === 0)) iconFileBySpell.set(spellId, { fileId, difficulty });
    }

    const names = parseCsvRecords(spellNameCsv);
    if (names.length === 0) throw new Error(`SpellName for build ${version} is empty`);
    const insert = db.prepare(
      "INSERT OR REPLACE INTO spells (id, name, name_lower, internal, icon_file_id, icon) VALUES (?, ?, ?, ?, ?, ?)",
    );
    let spellCount = 0;
    let spellsWithIcon = 0;
    const syncedAt = now().toISOString();

    const insertIcon = db.prepare("INSERT OR REPLACE INTO icons (file_id, name) VALUES (?, ?)");

    db.exec("BEGIN");
    try {
      db.exec("DELETE FROM icons");
      for (const [fileId, name] of iconByFileId) insertIcon.run(fileId, name);
      db.exec("DELETE FROM spells");
      for (const r of names) {
        const id = Number(r.ID);
        const name = r.Name_lang ?? "";
        if (!Number.isInteger(id) || id <= 0 || name === "") continue;
        const fileId = iconFileBySpell.get(id)?.fileId ?? null;
        const icon = fileId !== null ? (iconByFileId.get(fileId) ?? null) : null;
        insert.run(id, name, normalizeName(name), INTERNAL_NAME.test(name) ? 1 : 0, fileId, icon);
        spellCount++;
        if (icon) spellsWithIcon++;
      }
      setMeta.run("product", source.product);
      setMeta.run("build", version);
      setMeta.run("synced_at", syncedAt);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    return {
      product: source.product,
      build: version,
      syncedAt,
      spellCount,
      spellsWithIcon,
      durationMs: Date.now() - started,
    };
  }

  function search(query: string, opts: { limit?: number } = {}): SpellSearchResult {
    const q = normalizeName(query);
    const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(opts.limit ?? DEFAULT_LIMIT)));
    const build = getMeta("build");
    if (q === "") return { query, build, results: [] };

    const words = q.split(" ");
    const where = words.map((_, i) => `name_lower LIKE :w${i} ESCAPE '\\'`).join(" AND ");
    const params: Record<string, string | number> = {
      q,
      prefix: `${escapeLike(q)}%`,
      word: `% ${escapeLike(q)}%`,
      limit,
      id: /^\d+$/.test(q) ? Number(q) : -1,
    };
    words.forEach((w, i) => (params[`w${i}`] = `%${escapeLike(w)}%`));

    const rows = db
      .prepare(
        `SELECT id, name, icon,
           CASE WHEN id = :id THEN -1
                WHEN name_lower = :q THEN 0
                WHEN name_lower LIKE :prefix ESCAPE '\\' THEN 1
                WHEN name_lower LIKE :word ESCAPE '\\' THEN 2
                ELSE 3 END AS rank
         FROM spells
         WHERE id = :id OR (${where})
         ORDER BY rank, internal, icon IS NULL, length(name), name, id
         LIMIT :limit`,
      )
      .all(params) as { id: number; name: string; icon: string | null }[];

    return {
      query,
      build,
      results: rows.map((r) => ({ id: r.id, name: r.name, icon: r.icon, iconUrl: r.icon ? iconNameUrl(r.icon) : null })),
    };
  }

  async function fillWowhead(id: number): Promise<void> {
    const pending = wowheadInFlight.get(id);
    if (pending) return pending;
    const job = (async () => {
      const wh = await fetchWowheadSpell(fetchFn, source, id);
      const at = now().toISOString();
      if (wh.status === "found") putWowheadRow.run(id, "found", wh.name, wh.icon, wh.tooltip, wh.buff, at);
      else putWowheadRow.run(id, "not_found", null, null, null, null, at);
    })().finally(() => wowheadInFlight.delete(id));
    wowheadInFlight.set(id, job);
    return job;
  }

  async function lookup(id: number, opts: LookupOptions = {}): Promise<Spell> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError(`Invalid spell ID: ${id}`);
    const synced = getMeta("build") !== null;
    const spellRow = getSpellRow.get(id) as
      | { id: number; name: string; icon_file_id: number | null; icon: string | null }
      | undefined;

    type WowheadRow = { status: "found" | "not_found"; name: string | null; icon: string | null; tooltip: string | null; buff: string | null };
    let whRow = getWowheadRow.get(id) as WowheadRow | undefined;
    let unavailable = false;
    if (!whRow && opts.fetchWowhead !== false) {
      try {
        await fillWowhead(id);
        whRow = getWowheadRow.get(id) as WowheadRow | undefined;
      } catch {
        unavailable = true;
      }
    }

    const inGame = spellRow ? { name: spellRow.name, icon: spellRow.icon, iconFileId: spellRow.icon_file_id } : null;
    const whFound = whRow?.status === "found" ? whRow : null;
    const wowhead: Spell["wowhead"] = {
      status: whRow ? whRow.status : unavailable ? "unavailable" : "not_fetched",
      name: whFound?.name ?? null,
      icon: whFound?.icon ?? null,
    };

    const name = inGame?.name ?? whFound?.name ?? null;
    const icon = inGame?.icon ?? whFound?.icon ?? null;
    const found = inGame !== null || whFound !== null;

    const flags: SpellFlag[] = [];
    if (!found && (synced || wowhead.status === "not_found")) flags.push("unknown");
    if (!synced) flags.push("not-synced");
    else if (!inGame && whFound) flags.push("not-in-game");
    if (inGame && wowhead.status === "not_found") flags.push("not-on-wowhead");
    if (unavailable) flags.push("wowhead-unavailable");
    if (inGame && whFound?.name && normalizeName(inGame.name) !== normalizeName(whFound.name)) flags.push("name-mismatch");
    if (inGame?.icon && whFound?.icon && inGame.icon !== whFound.icon.toLowerCase()) flags.push("icon-mismatch");
    if (found && !icon) flags.push("no-icon");

    return {
      id,
      found,
      name,
      icon,
      iconUrl: icon ? iconNameUrl(icon) : null,
      tooltip: whFound?.tooltip ?? null,
      buff: whFound?.buff ?? null,
      source: {
        name: inGame ? "wago" : whFound ? "wowhead" : null,
        icon: inGame?.icon ? "wago" : whFound?.icon ? "wowhead" : null,
        tooltip: whFound?.tooltip ? "wowhead" : null,
      },
      inGame,
      wowhead,
      flags,
    };
  }

  const getIconByFile = db.prepare(
    // Databases synced before the icons table existed still know the icons their spells use.
    `SELECT coalesce((SELECT name FROM icons WHERE file_id = :id),
                     (SELECT icon FROM spells WHERE icon_file_id = :id AND icon IS NOT NULL LIMIT 1)) AS name`,
  );
  const getIconBySpell = db.prepare(
    `SELECT coalesce((SELECT icon FROM spells WHERE id = :id),
                     (SELECT lower(icon) FROM wowhead WHERE id = :id AND status = 'found')) AS name`,
  );

  function icons(request: { files?: number[]; spells?: number[] }): IconLookupResult {
    const result: IconLookupResult = { files: {}, spells: {} };
    const valid = (id: number) => Number.isSafeInteger(id) && id > 0;
    for (const id of request.files ?? []) {
      if (!valid(id)) continue;
      result.files[id] = (getIconByFile.get({ id }) as { name: string | null }).name;
    }
    for (const id of request.spells ?? []) {
      if (!valid(id)) continue;
      result.spells[id] = (getIconBySpell.get({ id }) as { name: string | null }).name;
    }
    return result;
  }

  function status(): SpellCacheStatus {
    const counts = db
      .prepare("SELECT count(*) AS spells, count(icon) AS icons FROM spells")
      .get() as { spells: number; icons: number };
    const wh = db
      .prepare(
        "SELECT sum(status = 'found') AS found, sum(status = 'not_found') AS notFound FROM wowhead",
      )
      .get() as { found: number | null; notFound: number | null };
    const build = getMeta("build");
    return {
      synced: build !== null,
      product: source.product,
      build,
      syncedAt: getMeta("synced_at"),
      spellCount: counts.spells,
      spellsWithIcon: counts.icons,
      wowhead: { found: wh.found ?? 0, notFound: wh.notFound ?? 0 },
    };
  }

  return {
    sync(opts = {}) {
      // One sync at a time; concurrent callers share the running one.
      if (!syncInFlight) syncInFlight = doSync(opts.build).finally(() => (syncInFlight = null));
      return syncInFlight;
    },
    search,
    lookup,
    icons,
    status,
    close: () => db.close(),
  };
}
