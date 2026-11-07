/**
 * A game's icon index: finds icons by how they look, for rebuilding an aura from a player's screenshot. Each icon's
 * pixels (the game file by FileDataID from wago.tools, decoded with `decodeTexture`) are kept as a small RGB grid
 * (`features.ts`) in SQLite per game (`data/<game>/icon-features.sqlite`; null for an icon that can't be read).
 *
 * The index fills lazily: a search with a name filter fetches just the matching icons it lacks (a bounded number);
 * a search of every icon needs the whole index, so until it is complete the first such search starts building it in
 * the background (persisted as it goes, so a restart resumes it) and answers with its progress.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { IconColourMode, IconIndexProgress, IconSearchHit, IconSimilarResult } from "@/api/files";
import { decodeTexture } from "@/render/textures/decode";
import { fileDataIdUrl } from "@/render/textures/paths";
import type { GameFiles } from "@/server/game-files";
import { searchPage, type SearchPage } from "@/server/name-search";
import type { FetchFn } from "@/server/spells/sources";
import { autoMode, GRID, iconGrid, iconMatcher, meanSaturation, type RgbaImage } from "./features";

export interface IconIndexOptions {
  /** The game's file list: which icons there are. */
  files: GameFiles;
  /** SQLite file path, or ":memory:". */
  dbPath: string;
  /** Fetches icon files (`https://wago.tools/api/casc/<FileDataID>`, BLP or TGA). */
  fetch?: FetchFn;
  /** Icon downloads at a time (default 6). */
  concurrency?: number;
  /** The most icons a filtered search fetches on demand (default 300). */
  onDemandLimit?: number;
}

export interface IconSimilarRequest extends Partial<SearchPage> {
  /** Name filter (`searchIcons`' matching): compare only these icons. Empty or null: every icon of the game. */
  q?: string | null;
  colour?: IconColourMode;
}

export interface IconIndexStatus {
  /** Icons in the index (with pixels or known to be unreadable), of `total` icons of the game. */
  indexed: number;
  total: number;
  building: boolean;
}

export interface IconIndex {
  /** Icons ranked by how alike they look to the upload, or the index's progress when it must be built first. */
  similar(upload: RgbaImage, request?: IconSimilarRequest): Promise<IconSimilarResult | IconIndexProgress>;
  /** Builds the whole index (what a search of every icon starts in the background); resolves when done. */
  build(): Promise<void>;
  status(): Promise<IconIndexStatus>;
  close(): void;
}

/** Bump when `features.ts`' stored grid changes: the stored grids are dropped and fetched again. */
const FORMAT = `grid-rgb-${GRID}`;
const RETRY_AFTER_SECONDS = 30;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS features (id INTEGER PRIMARY KEY, grid BLOB);
`;

/** What indexing one icon came to: stored with pixels, stored as unreadable, or a failure worth retrying later. */
type IndexOutcome = "ok" | "unreadable" | "failed";

export function createIconIndex(options: IconIndexOptions): IconIndex {
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const concurrency = options.concurrency ?? 6;
  const onDemandLimit = options.onDemandLimit ?? 300;
  const { files } = options;
  if (options.dbPath !== ":memory:") mkdirSync(path.dirname(options.dbPath), { recursive: true });
  const db = new DatabaseSync(options.dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  db.exec(SCHEMA);
  const format = (db.prepare("SELECT value FROM meta WHERE key = 'format'").get() as { value: string } | undefined)?.value;
  if (format !== FORMAT) {
    db.exec("DELETE FROM features");
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('format', ?)").run(FORMAT);
  }
  const store = db.prepare("INSERT OR REPLACE INTO features (id, grid) VALUES (?, ?)");
  const storedIds = (): Set<number> => new Set((db.prepare("SELECT id FROM features").all() as { id: number }[]).map((r) => r.id));

  const inFlight = new Map<number, Promise<IndexOutcome>>();
  let building: Promise<void> | null = null;

  async function indexOne(id: number): Promise<IndexOutcome> {
    let bytes: Uint8Array;
    try {
      const res = await fetchFn(fileDataIdUrl(id));
      if (res.status === 404) {
        store.run(id, null);
        return "unreadable";
      }
      if (!res.ok) return "failed";
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch {
      return "failed"; // network: try again another time
    }
    try {
      store.run(id, iconGrid(decodeTexture(bytes)));
      return "ok";
    } catch {
      store.run(id, null); // not a texture decodeTexture reads
      return "unreadable";
    }
  }

  /** Indexes icons (each once at a time, `concurrency` downloads at a time); the outcome per icon. */
  async function indexIcons(ids: number[]): Promise<Map<number, IndexOutcome>> {
    const outcomes = new Map<number, IndexOutcome>();
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++];
        let p = inFlight.get(id);
        if (!p) {
          p = indexOne(id).finally(() => inFlight.delete(id));
          inFlight.set(id, p);
        }
        outcomes.set(id, await p);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
    return outcomes;
  }

  function build(): Promise<void> {
    building ??= (async () => {
      const icons = await files.listIcons(null);
      const stored = storedIds();
      await indexIcons(icons.map((i) => i.id).filter((id) => !stored.has(id)));
    })().finally(() => (building = null));
    return building;
  }

  async function status(): Promise<IconIndexStatus> {
    const icons = await files.listIcons(null);
    const stored = storedIds();
    return { indexed: icons.filter((i) => stored.has(i.id)).length, total: icons.length, building: building !== null };
  }

  /** Starts building the whole index (unless it is already) and answers its progress. */
  async function progress(hint: string): Promise<IconIndexProgress> {
    if (!building) build().catch(() => {}); // a failed build is started again by the next search
    const { indexed, total } = await status();
    return { status: "indexing", indexed, total, retryAfter: RETRY_AFTER_SECONDS, hint };
  }

  async function similar(upload: RgbaImage, request: IconSimilarRequest = {}): Promise<IconSimilarResult | IconIndexProgress> {
    const { offset, limit } = searchPage(request);
    const query = request.q?.trim() ? request.q : null;
    const candidates = await files.listIcons(query);
    const stored = storedIds();
    const missing = candidates.filter((i) => !stored.has(i.id)).map((i) => i.id);
    if (missing.length > 0) {
      if (query === null) {
        return progress(
          `The icon index is being built (${stored.size} of ${candidates.length} icons so far, downloaded ${concurrency} at a time). ` +
            `Retry in about ${RETRY_AFTER_SECONDS} seconds, or pass q=<words of the icon's name> to compare only icons whose names match ` +
            `(up to ${onDemandLimit} not yet indexed are fetched on demand).`,
        );
      }
      if (missing.length > onDemandLimit) {
        return progress(
          `q matches ${candidates.length} icons, ${missing.length} of them not indexed yet; a search fetches at most ${onDemandLimit}. ` +
            `Narrow q, or retry once the index (being built now) has them.`,
        );
      }
      await indexIcons(missing); // an icon whose download failed is left out of this answer (counted in `unavailable`)
    }

    const byId = new Map<number, IconSearchHit>(candidates.map((i) => [i.id, i]));
    const rows = (
      query === null
        ? db.prepare("SELECT id, grid FROM features WHERE grid IS NOT NULL").all()
        : db.prepare("SELECT id, grid FROM features WHERE grid IS NOT NULL AND id IN (SELECT value FROM json_each(?))").all(JSON.stringify([...byId.keys()]))
    ) as { id: number; grid: Uint8Array }[];

    const saturation = meanSaturation(upload);
    const requestedMode = request.colour ?? "auto";
    const mode = requestedMode === "auto" ? autoMode(saturation) : requestedMode;
    const matcher = iconMatcher(upload, mode);
    const ranked = rows
      .filter((r) => byId.has(r.id))
      .map((r) => ({ icon: byId.get(r.id)!, match: matcher.match(r.grid) }))
      .sort((a, b) => a.match.distance - b.match.distance || a.icon.id - b.icon.id);
    const best = ranked[0]?.match.distance ?? 0;
    const close = best + Math.max(0.01, best * 0.1);
    const round = (n: number) => Math.round(n * 10000) / 10000;
    return {
      status: "ok",
      query,
      build: files.status().build,
      requestedMode,
      mode,
      saturation: round(saturation),
      offset,
      limit,
      total: ranked.length,
      unavailable: candidates.length - ranked.length,
      closeToBest: ranked.filter((r) => r.match.distance <= close).length,
      results: ranked.slice(offset, offset + limit).map(({ icon, match }) => ({
        ...icon,
        distance: round(match.distance),
        zoom: round(match.iconInset * 4),
        uploadInset: match.uploadInset,
      })),
    };
  }

  return { similar, build, status, close: () => db.close() };
}
