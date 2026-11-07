/**
 * A game's items: names, quality and item level from wago.tools' ItemSparse, class and icon FileDataID from Item, for
 * the game's product (the latest build), in SQLite per game (`data/<game>/items.sqlite`). Icons are named through
 * the game's file list (`GameFiles`). Downloaded on first use and kept; `sync` downloads them again.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { auraIconPath, iconNameOfPath } from "@/api/files";
import { ITEM_QUALITIES, type Item, type ItemSearchResult } from "@/api/items";
import { iconNameUrl } from "@/api/spells";
import type { GameFiles } from "@/server/game-files";
import { nameQuery, normalizeName, searchLimit } from "@/server/name-search";
import { parseCsvRecords } from "@/server/spells/csv";
import { fetchLatestBuild, fetchWagoCsv, type FetchFn, type SpellSource } from "@/server/spells/sources";

export interface ItemCacheOptions {
  /** The game client's wago.tools product and Wowhead environment (its spell source). */
  source: SpellSource;
  /** SQLite file path, or ":memory:". */
  dbPath: string;
  /** The game's file list, which names the icons. */
  files: GameFiles;
  fetch?: FetchFn;
  now?: () => Date;
}

export interface ItemCacheStatus {
  synced: boolean;
  product: string;
  build: string | null;
  syncedAt: string | null;
  itemCount: number;
}

export interface ItemCache {
  /** Downloads the item tables of a build (default: the product's latest). */
  sync(options?: { build?: string }): Promise<ItemCacheStatus>;
  /** Name search (case-insensitive; every word must occur), best matches first. A numeric query also matches the ID. */
  search(query: string, options?: { limit?: number }): Promise<ItemSearchResult>;
  /** One item, or null when the game has no item with the ID. */
  lookup(id: number): Promise<Item | null>;
  status(): ItemCacheStatus;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL,
  quality INTEGER NOT NULL,
  item_level INTEGER NOT NULL,
  class_id INTEGER,
  subclass_id INTEGER,
  icon_file_id INTEGER
);
`;

interface ItemRow {
  id: number;
  name: string;
  quality: number;
  item_level: number;
  class_id: number | null;
  subclass_id: number | null;
  icon_file_id: number | null;
}

const int = (s: string | undefined): number | null => {
  const n = Number(s);
  return s !== undefined && s !== "" && Number.isInteger(n) ? n : null;
};

export function createItemCache(options: ItemCacheOptions): ItemCache {
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => new Date());
  const { source, files } = options;
  if (options.dbPath !== ":memory:") mkdirSync(path.dirname(options.dbPath), { recursive: true });
  const db = new DatabaseSync(options.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

  const getMeta = (key: string): string | null =>
    (db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
  const storedProduct = getMeta("product");
  if (storedProduct !== null && storedProduct !== source.product) {
    db.close();
    throw new Error(`${options.dbPath} holds ${storedProduct} items, not ${source.product}`);
  }
  const setMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const COLUMNS = "id, name, quality, item_level, class_id, subclass_id, icon_file_id";
  const getRow = db.prepare(`SELECT ${COLUMNS} FROM items WHERE id = ?`);

  let syncInFlight: Promise<ItemCacheStatus> | null = null;

  async function doSync(build?: string): Promise<ItemCacheStatus> {
    const version = build ?? (await fetchLatestBuild(fetchFn, source.product));
    const [sparseCsv, itemCsv] = await Promise.all([fetchWagoCsv(fetchFn, "ItemSparse", version), fetchWagoCsv(fetchFn, "Item", version)]);
    const sparse = parseCsvRecords(sparseCsv);
    if (sparse.length === 0) throw new Error(`ItemSparse for build ${version} is empty`);
    const item = new Map(parseCsvRecords(itemCsv).map((r) => [Number(r.ID), r]));
    const insert = db.prepare(
      "INSERT OR REPLACE INTO items (id, name, name_lower, quality, item_level, class_id, subclass_id, icon_file_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    db.exec("BEGIN");
    try {
      db.exec("DELETE FROM items");
      for (const r of sparse) {
        const id = Number(r.ID);
        const name = r.Display_lang ?? "";
        if (!Number.isSafeInteger(id) || id <= 0 || name === "") continue;
        const it = item.get(id);
        const icon = int(it?.IconFileDataID);
        insert.run(id, name, normalizeName(name), int(r.OverallQualityID) ?? 1, int(r.ItemLevel) ?? 0, int(it?.ClassID), int(it?.SubclassID), icon && icon > 0 ? icon : null);
      }
      setMeta.run("product", source.product);
      setMeta.run("build", version);
      setMeta.run("synced_at", now().toISOString());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return status();
  }

  function sync(opts: { build?: string } = {}): Promise<ItemCacheStatus> {
    syncInFlight ??= doSync(opts.build).finally(() => (syncInFlight = null));
    return syncInFlight;
  }

  async function ready(): Promise<void> {
    if (getMeta("build") === null) await sync();
  }

  async function toItems(rows: ItemRow[]): Promise<Item[]> {
    const ids = [...new Set(rows.map((r) => r.icon_file_id).filter((id): id is number => id !== null))];
    const icons = ids.length ? (await files.lookup({ ids })).ids : {};
    return rows.map((r) => {
      const file = r.icon_file_id !== null ? icons[r.icon_file_id] : null;
      const icon = file ? iconNameOfPath(file.path) : null;
      return {
        id: r.id,
        name: r.name,
        quality: r.quality,
        qualityName: ITEM_QUALITIES[r.quality] ?? null,
        itemLevel: r.item_level,
        classId: r.class_id,
        subclassId: r.subclass_id,
        iconFileId: r.icon_file_id,
        icon,
        iconPath: file && icon ? auraIconPath(file.path) : null,
        iconUrl: icon ? iconNameUrl(icon) : null,
        wowhead: `https://www.wowhead.com/${source.wowhead.path}/item=${r.id}`,
      };
    });
  }

  async function search(query: string, opts: { limit?: number } = {}): Promise<ItemSearchResult> {
    await ready();
    const limit = searchLimit(opts.limit);
    const build = getMeta("build");
    const q = normalizeName(query);
    if (q === "") return { query, build, limit, total: 0, results: [] };
    const { where, rank, params } = nameQuery(q, "name_lower");
    const id = /^\d+$/.test(q) ? Number(q) : -1;
    const rows = db
      .prepare(`SELECT ${COLUMNS}, CASE WHEN id = :id THEN -1 ELSE ${rank} END AS rank FROM items WHERE id = :id OR (${where})
        ORDER BY rank, icon_file_id IS NULL, length(name), name, id LIMIT ${limit}`)
      .all({ ...params, id }) as unknown as ItemRow[];
    const wordParams = Object.fromEntries(Object.entries(params).filter(([k]) => /^w\d+$/.test(k)));
    const { total } = db.prepare(`SELECT count(*) AS total FROM items WHERE id = :id OR (${where})`).get({ ...wordParams, id }) as { total: number };
    return { query, build, limit, total, results: await toItems(rows) };
  }

  async function lookup(id: number): Promise<Item | null> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new RangeError(`Invalid item ID: ${id}`);
    await ready();
    const row = getRow.get(id) as ItemRow | undefined;
    return row ? (await toItems([row]))[0] : null;
  }

  function status(): ItemCacheStatus {
    const { items } = db.prepare("SELECT count(*) AS items FROM items").get() as { items: number };
    const build = getMeta("build");
    return { synced: build !== null, product: source.product, build, syncedAt: getMeta("synced_at"), itemCount: items };
  }

  return { sync, search, lookup, status, close: () => db.close() };
}
