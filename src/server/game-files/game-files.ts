/**
 * A game's file list: every file of its client under `Interface\` with its FileDataID, from wago.tools'
 * ManifestInterfaceData for the game's product (the latest build), kept in SQLite per game
 * (`data/<game>/files.sqlite`). It turns texture paths (`Interface\Cursor\Cast`, `Interface\Icons\NAME`) into
 * FileDataIDs the page can download, names icons by FileDataID and finds icons by name.
 *
 * The list is downloaded on first use (one CSV of a few MB) and kept; `sync` downloads it again.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { iconNameUrl } from "@/api/spells";
import { auraIconPath, gameFileKey, iconNameOfPath, type FileLookupResult, type GameFile, type IconSearchResult } from "@/api/files";
import { nameQuery, normalizeName, searchLimit } from "@/server/name-search";
import { parseCsvRecords } from "@/server/spells/csv";
import { fetchLatestBuild, fetchWagoCsv, type FetchFn, type SpellSource } from "@/server/spells/sources";

export interface GameFilesOptions {
  /** The game client's wago.tools product (its spell source names it). */
  source: Pick<SpellSource, "product">;
  /** SQLite file path, or ":memory:". */
  dbPath: string;
  fetch?: FetchFn;
  now?: () => Date;
}

export interface GameFilesStatus {
  synced: boolean;
  product: string;
  build: string | null;
  syncedAt: string | null;
  fileCount: number;
  iconCount: number;
}

export interface GameFiles {
  /** Downloads the file list of a build (default: the product's latest). */
  sync(options?: { build?: string }): Promise<GameFilesStatus>;
  /** Downloads the file list once, when it never was. */
  ready(): Promise<void>;
  /** Files by path (case-insensitive, `/` or `\`, with or without `.blp`/`.tga`) and by FileDataID. */
  lookup(request: { paths?: string[]; ids?: number[] }): Promise<FileLookupResult>;
  /** Icons (`Interface\Icons\…`) by name; every word of the query must occur in the icon's name. */
  searchIcons(query: string, options?: { limit?: number }): Promise<IconSearchResult>;
  status(): GameFilesStatus;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL,
  key TEXT NOT NULL,
  icon TEXT
);
CREATE INDEX IF NOT EXISTS files_key ON files (key);
CREATE INDEX IF NOT EXISTS files_icon ON files (icon) WHERE icon IS NOT NULL;
`;

export function createGameFiles(options: GameFilesOptions): GameFiles {
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => new Date());
  const { product } = options.source;
  if (options.dbPath !== ":memory:") mkdirSync(path.dirname(options.dbPath), { recursive: true });
  const db = new DatabaseSync(options.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  const getMeta = (key: string): string | null =>
    (db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
  const storedProduct = getMeta("product");
  if (storedProduct !== null && storedProduct !== product) {
    db.close();
    throw new Error(`${options.dbPath} holds ${storedProduct} files, not ${product}`);
  }
  const setMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  // Several files can share a key (the same name as .blp and .tga): the lowest FileDataID answers, as stable as any.
  const byKey = db.prepare("SELECT id, path FROM files WHERE key = ? ORDER BY id LIMIT 1");
  const byId = db.prepare("SELECT id, path FROM files WHERE id = ?");

  let syncInFlight: Promise<GameFilesStatus> | null = null;

  async function doSync(build?: string): Promise<GameFilesStatus> {
    const version = build ?? (await fetchLatestBuild(fetchFn, product));
    const rows = parseCsvRecords(await fetchWagoCsv(fetchFn, "ManifestInterfaceData", version));
    if (rows.length === 0) throw new Error(`ManifestInterfaceData for build ${version} is empty`);
    const insert = db.prepare("INSERT OR REPLACE INTO files (id, path, key, icon) VALUES (?, ?, ?, ?)");
    db.exec("BEGIN");
    try {
      db.exec("DELETE FROM files");
      for (const r of rows) {
        const id = Number(r.ID);
        const file = `${r.FilePath ?? ""}${r.FileName ?? ""}`;
        if (!Number.isSafeInteger(id) || id <= 0 || !r.FileName) continue;
        insert.run(id, file, gameFileKey(file), iconNameOfPath(file));
      }
      setMeta.run("product", product);
      setMeta.run("build", version);
      setMeta.run("synced_at", now().toISOString());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return status();
  }

  function sync(opts: { build?: string } = {}): Promise<GameFilesStatus> {
    syncInFlight ??= doSync(opts.build).finally(() => (syncInFlight = null));
    return syncInFlight;
  }

  async function ready(): Promise<void> {
    if (getMeta("build") === null) await sync();
  }

  async function lookup(request: { paths?: string[]; ids?: number[] }): Promise<FileLookupResult> {
    await ready();
    const result: FileLookupResult = { build: getMeta("build"), paths: {}, ids: {} };
    for (const p of request.paths ?? []) result.paths[p] = (byKey.get(gameFileKey(p)) as GameFile | undefined) ?? null;
    for (const id of request.ids ?? []) {
      if (Number.isSafeInteger(id) && id > 0) result.ids[id] = (byId.get(id) as GameFile | undefined) ?? null;
    }
    return result;
  }

  async function searchIcons(query: string, opts: { limit?: number } = {}): Promise<IconSearchResult> {
    await ready();
    const limit = searchLimit(opts.limit);
    const build = getMeta("build");
    // A path or a file name searches by the icon's name.
    const q = normalizeName(iconNameOfPath(query) ?? query.replace(/\.blp$/i, ""));
    if (q === "") return { query, build, limit, total: 0, results: [] };
    const { where, rank, params } = nameQuery(q, "icon", " _");
    const rows = db
      .prepare(`SELECT id, path, icon, ${rank} AS rank FROM files WHERE icon IS NOT NULL AND ${where}
        ORDER BY rank, length(icon), icon, id LIMIT ${limit}`)
      .all(params) as { id: number; path: string; icon: string }[];
    const { total } = db
      .prepare(`SELECT count(*) AS total FROM files WHERE icon IS NOT NULL AND ${where}`)
      .get(Object.fromEntries(Object.entries(params).filter(([k]) => /^w\d+$/.test(k)))) as { total: number };
    return {
      query,
      build,
      limit,
      total,
      results: rows.map((r) => ({ id: r.id, name: r.icon, path: auraIconPath(r.path), iconUrl: iconNameUrl(r.icon) })),
    };
  }

  function status(): GameFilesStatus {
    const counts = db.prepare("SELECT count(*) AS files, count(icon) AS icons FROM files").get() as { files: number; icons: number };
    const build = getMeta("build");
    return { synced: build !== null, product, build, syncedAt: getMeta("synced_at"), fileCount: counts.files, iconCount: counts.icons };
  }

  return { sync, ready, lookup, searchIcons, status, close: () => db.close() };
}
