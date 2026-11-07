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
import { auraIconPath, gameFileKey, iconNameOfPath, type FileLookupResult, type GameFile, type IconSearchHit, type IconSearchResult } from "@/api/files";
import { nameQuery, normalizeName, searchPage, type SearchPage } from "@/server/name-search";
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
  /**
   * Icons (`Interface\Icons\…`) by name, best matches first, one page of them; every word of the query must occur in
   * the icon's name.
   */
  searchIcons(query: string, page?: Partial<SearchPage>): Promise<IconSearchResult>;
  /**
   * Every icon matching a query (`searchIcons`' matching and order), or every icon of the game when the query is
   * null. No limit: for code that ranks icons in another way (`IconIndex`).
   */
  listIcons(query: string | null): Promise<IconSearchHit[]>;
  /**
   * One icon by FileDataID (digits), `Interface\Icons\…` path or icon name (any case, with or without `.blp`); null
   * when the game has no such icon (a FileDataID of a file outside `Interface\Icons\` is none).
   */
  resolveIcon(ref: string): Promise<IconSearchHit | null>;
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

  /** The SQL of an icon name query (a path or a file name searches by the icon's name); null for an empty query. */
  function iconQuery(query: string): { where: string; order: string; params: Record<string, string>; wordParams: Record<string, string> } | null {
    const q = normalizeName(iconNameOfPath(query) ?? query.replace(/\.blp$/i, ""));
    if (q === "") return null;
    const { where, rank, params } = nameQuery(q, "icon", " _");
    const wordParams = Object.fromEntries(Object.entries(params).filter(([k]) => /^w\d+$/.test(k)));
    return { where: `icon IS NOT NULL AND ${where}`, order: `${rank}, length(icon), icon, id`, params, wordParams };
  }

  const toHit = (r: { id: number; path: string; icon: string }): IconSearchHit => ({
    id: r.id,
    name: r.icon,
    path: auraIconPath(r.path),
    iconUrl: iconNameUrl(r.icon),
  });

  async function searchIcons(query: string, requested: Partial<SearchPage> = {}): Promise<IconSearchResult> {
    await ready();
    const { offset, limit } = searchPage(requested);
    const build = getMeta("build");
    const sql = iconQuery(query);
    if (!sql) return { query, build, offset, limit, total: 0, results: [] };
    const rows = db
      .prepare(`SELECT id, path, icon FROM files WHERE ${sql.where} ORDER BY ${sql.order} LIMIT ${limit} OFFSET ${offset}`)
      .all(sql.params) as { id: number; path: string; icon: string }[];
    const { total } = db.prepare(`SELECT count(*) AS total FROM files WHERE ${sql.where}`).get(sql.wordParams) as { total: number };
    return { query, build, offset, limit, total, results: rows.map(toHit) };
  }

  async function listIcons(query: string | null): Promise<IconSearchHit[]> {
    await ready();
    if (query === null) {
      return (db.prepare("SELECT id, path, icon FROM files WHERE icon IS NOT NULL ORDER BY id").all() as { id: number; path: string; icon: string }[]).map(toHit);
    }
    const sql = iconQuery(query);
    if (!sql) return [];
    return (db.prepare(`SELECT id, path, icon FROM files WHERE ${sql.where} ORDER BY ${sql.order}`).all(sql.params) as { id: number; path: string; icon: string }[]).map(toHit);
  }

  async function resolveIcon(ref: string): Promise<IconSearchHit | null> {
    await ready();
    const trimmed = ref.trim();
    let row: GameFile | undefined;
    if (/^\d+$/.test(trimmed)) row = byId.get(Number(trimmed)) as GameFile | undefined;
    else {
      const name = iconNameOfPath(trimmed) ?? trimmed.replace(/\.blp$/i, "");
      if (name === "" || /[\\/]/.test(name)) return null;
      row = byKey.get(gameFileKey(`Interface/Icons/${name}`)) as GameFile | undefined;
    }
    const icon = row ? iconNameOfPath(row.path) : null;
    return row && icon ? toHit({ id: row.id, path: row.path, icon }) : null;
  }

  function status(): GameFilesStatus {
    const counts = db.prepare("SELECT count(*) AS files, count(icon) AS icons FROM files").get() as { files: number; icons: number };
    const build = getMeta("build");
    return { synced: build !== null, product, build, syncedAt: getMeta("synced_at"), fileCount: counts.files, iconCount: counts.icons };
  }

  return { sync, ready, lookup, searchIcons, listIcons, resolveIcon, status, close: () => db.close() };
}
