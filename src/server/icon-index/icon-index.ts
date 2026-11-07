/**
 * A game's icon index: finds icons, and the game's other textures, by how they look, for rebuilding an aura from a
 * player's screenshot. Each file's pixels (a game file by FileDataID from wago.tools, or one of the addon's own
 * textures; decoded with `decodeTexture`) are kept as a small grid (`features.ts`) in SQLite per game
 * (`data/<game>/icon-features.sqlite`; null for a file that can't be read, marked `failed` when its download failed,
 * which is tried again).
 *
 * Two kinds (`TextureKind`): icons (`Interface\Icons\`) and textures (every other texture file of the game's file
 * list, and the addon's media). The index fills lazily: a search with a name filter fetches just the matching files it
 * lacks (a bounded number); a search of every file of a kind needs that whole kind indexed, so until then it starts
 * building it in the background (persisted as it goes, so a restart resumes it) and answers its progress with an
 * estimate of the time left. Icons are also built after each download of the game's file list (`createClientCaches`).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  gameFileKey,
  type IconColourMode,
  type IconIndexProgress,
  type IconIndexStatus,
  type IconSearchHit,
  type IconSimilarResult,
  type IndexCount,
  type TextureKind,
  type TextureSimilarResult,
} from "@/api/files";
import { errorMessage } from "@/lib/errors";
import { decodeTexture } from "@/render/textures/decode";
import { fileDataIdUrl } from "@/render/textures/paths";
import type { GameFiles } from "@/server/game-files";
import { searchPage, type SearchPage } from "@/server/name-search";
import type { FetchFn } from "@/server/spells/sources";
import { autoMode, GRID, meanSaturation, textureGrid, textureMatcher, type RgbaImage, type TextureMatch } from "./features";

/** One of the addon's own textures: its path as an aura writes it (`Interface\AddOns\…`, no extension) and its bytes. */
export interface AddonTexture {
  path: string;
  read(): Promise<Uint8Array>;
}

export interface IconIndexOptions {
  /** The game's file list: which icons and textures there are. */
  files: GameFiles;
  /** The addon's own textures (searched with the game's other textures); none when absent. */
  addonTextures?: () => Promise<AddonTexture[]>;
  /** SQLite file path, or ":memory:". */
  dbPath: string;
  /** Fetches game files (`https://wago.tools/api/casc/<FileDataID>`, BLP or TGA). */
  fetch?: FetchFn;
  /** Downloads at a time (default 6). */
  concurrency?: number;
  /** The most files a filtered search fetches on demand (default 300). */
  onDemandLimit?: number;
  /** How often a build tries a failed download again, and how long it waits before each round (default 2, 5 s). */
  retries?: number;
  retryDelayMs?: number;
  now?: () => number;
}

export interface IconSimilarRequest extends Partial<SearchPage> {
  /** Name filter: words of an icon's name (`searchIcons`' matching) or of a texture's path. Empty or null: every file of the kind. */
  q?: string | null;
  colour?: IconColourMode;
  kind?: TextureKind;
}

/** An icon or texture search's answer before the route adds each hit's `pictureUrl` (it knows the server's address). */
type WithoutPicture<R extends { results: object[] }> = Omit<R, "results"> & { results: Omit<R["results"][number], "pictureUrl">[] };
export type IndexSimilarResult = WithoutPicture<IconSimilarResult> | WithoutPicture<TextureSimilarResult>;

export interface IconIndex {
  /** Files of a kind ranked by how alike they look to the upload, or the index's progress when it must be built first. */
  similar(upload: RgbaImage, request?: IconSimilarRequest): Promise<IndexSimilarResult | IconIndexProgress>;
  /** Builds the index of these kinds (default: icons), retrying failed downloads; resolves when done. */
  build(kinds?: TextureKind[]): Promise<void>;
  status(): Promise<IconIndexStatus>;
  close(): void;
}

/** Bump when `features.ts`' stored grid changes: the stored grids are dropped and fetched again. */
const FORMAT = `grid-rgba-${GRID}`;
const KINDS: readonly TextureKind[] = ["icon", "texture"];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS features (file TEXT PRIMARY KEY, grid BLOB, failed INTEGER NOT NULL DEFAULT 0);
`;

/** What downloading one file came to: its bytes, a file that can't be read (stored as such), or a failure to retry. */
type Download = { bytes: Uint8Array } | { unreadable: true } | { failed: string };

/** A file the index can compare: its key in the table, how to download it and what a search answers for it. */
interface Candidate {
  file: string;
  download(): Promise<Download>;
  hit: IconSearchHit | { id: number | null; path: string; from: "game" | "addon" };
}

/** A game texture's path as an aura writes it: the client's path without its extension. */
const auraTexturePath = (clientPath: string) => clientPath.replace(/\.(blp|tga)$/i, "");

export function createIconIndex(options: IconIndexOptions): IconIndex {
  const fetchFn: FetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const concurrency = options.concurrency ?? 6;
  const onDemandLimit = options.onDemandLimit ?? 300;
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 5000;
  const now = options.now ?? Date.now;
  const { files } = options;
  if (options.dbPath !== ":memory:") mkdirSync(path.dirname(options.dbPath), { recursive: true });
  const db = new DatabaseSync(options.dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
  const format = (db.prepare("SELECT value FROM meta WHERE key = 'format'").get() as { value: string } | undefined)?.value;
  if (format !== FORMAT) db.exec("DROP TABLE IF EXISTS features");
  db.exec(SCHEMA);
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('format', ?)").run(FORMAT);
  const store = db.prepare("INSERT OR REPLACE INTO features (file, grid, failed) VALUES (?, ?, ?)");
  /** Each stored file: whether its last download failed. */
  const storedFiles = (): Map<string, boolean> =>
    new Map((db.prepare("SELECT file, failed FROM features").all() as { file: string; failed: number }[]).map((r) => [r.file, r.failed === 1]));

  const gameDownload = (id: number) => async (): Promise<Download> => {
    try {
      const res = await fetchFn(fileDataIdUrl(id));
      if (res.status === 404) return { unreadable: true };
      if (!res.ok) return { failed: `wago.tools answered ${res.status} for FileDataID ${id}` };
      return { bytes: new Uint8Array(await res.arrayBuffer()) };
    } catch (err) {
      return { failed: `FileDataID ${id}: ${errorMessage(err)}` };
    }
  };

  async function candidates(kind: TextureKind, query: string | null): Promise<Candidate[]> {
    if (kind === "icon") {
      return (await files.listIcons(query)).map((hit) => ({ file: String(hit.id), download: gameDownload(hit.id), hit }));
    }
    const game: Candidate[] = (await files.listTextures(query)).map((f) => ({
      file: String(f.id),
      download: gameDownload(f.id),
      hit: { id: f.id, path: auraTexturePath(f.path), from: "game" },
    }));
    const words = (query ?? "").toLowerCase().split(/[\s\\/_\-.]+/).filter(Boolean);
    const addon: Candidate[] = (await (options.addonTextures?.() ?? Promise.resolve([])))
      .filter((t) => words.every((w) => gameFileKey(t.path).includes(w)))
      .map((t) => ({
        file: `addon:${gameFileKey(t.path)}`,
        download: async () => {
          try {
            return { bytes: await t.read() };
          } catch (err) {
            return { failed: `${t.path}: ${errorMessage(err)}` };
          }
        },
        hit: { id: null, path: t.path, from: "addon" },
      }));
    return [...game, ...addon];
  }

  const inFlight = new Map<string, Promise<void>>();
  let lastError: string | null = null;
  /** The current build's speed: when it started and how many files it has indexed since. */
  let speed: { since: number; done: number } | null = null;

  async function indexOne(c: Candidate): Promise<void> {
    const got = await c.download();
    if ("failed" in got) {
      lastError = got.failed;
      store.run(c.file, null, 1);
    } else if ("unreadable" in got) store.run(c.file, null, 0);
    else {
      try {
        store.run(c.file, textureGrid(decodeTexture(got.bytes)), 0);
      } catch {
        store.run(c.file, null, 0); // not a texture decodeTexture reads
      }
    }
    if (speed) speed.done++;
  }

  /** Indexes files (each once at a time, `concurrency` downloads at a time). */
  async function indexAll(list: Candidate[]): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const c = list[next++];
        let p = inFlight.get(c.file);
        if (!p) {
          p = indexOne(c).finally(() => inFlight.delete(c.file));
          inFlight.set(c.file, p);
        }
        await p;
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  }

  /** Indexes every file of a kind not yet indexed, then tries failed downloads again a few times. */
  async function buildKind(kind: TextureKind): Promise<void> {
    for (let round = 0; round <= retries; round++) {
      const stored = storedFiles();
      const todo = (await candidates(kind, null)).filter((c) => (round === 0 ? stored.get(c.file) !== false : stored.get(c.file) === true));
      if (todo.length === 0) return;
      if (round > 0) await new Promise((r) => setTimeout(r, retryDelayMs * round));
      await indexAll(todo);
    }
  }

  const wanted = new Set<TextureKind>();
  let building: TextureKind | null = null;
  let running: Promise<void> | null = null;

  function build(kinds: TextureKind[] = ["icon"]): Promise<void> {
    for (const k of kinds) wanted.add(k);
    running ??= (async () => {
      speed = { since: now(), done: 0 };
      while (wanted.size > 0) {
        const kind = KINDS.find((k) => wanted.has(k))!;
        building = kind;
        try {
          await buildKind(kind);
        } catch (err) {
          lastError = `Building the ${kind} index: ${errorMessage(err)}`;
        }
        wanted.delete(kind);
      }
    })().finally(() => {
      running = null;
      building = null;
      speed = null;
    });
    return running;
  }

  function count(list: Candidate[], stored: Map<string, boolean>): IndexCount {
    let indexed = 0;
    let failed = 0;
    for (const c of list) {
      const s = stored.get(c.file);
      if (s === false) indexed++;
      else if (s === true) failed++;
    }
    return { indexed, failed, total: list.length };
  }

  const perSecond = (): number | null => {
    if (!speed || speed.done === 0) return null;
    const seconds = (now() - speed.since) / 1000;
    return seconds > 0 ? Math.round((speed.done / seconds) * 10) / 10 : null;
  };

  async function status(): Promise<IconIndexStatus> {
    const stored = storedFiles();
    const [icons, textures] = await Promise.all(KINDS.map(async (k) => count(await candidates(k, null), stored)));
    return { icons, textures, building, perSecond: perSecond(), lastError };
  }

  /** Starts building a kind (unless it is being built) and answers its progress with the time left. */
  async function progress(kind: TextureKind, hint: (eta: string) => string): Promise<IconIndexProgress> {
    if (!running || !wanted.has(kind)) build([kind]).catch(() => {}); // a failed build is started again by the next search
    const s = await status();
    const own = kind === "icon" ? s.icons : s.textures;
    // Files still to download before this kind is done (icons are built first).
    const ahead = (kind === "texture" && s.building === "icon" ? s.icons.total - s.icons.indexed - s.icons.failed : 0) + own.total - own.indexed - own.failed;
    const etaSeconds = s.perSecond ? Math.ceil(ahead / s.perSecond) : null;
    const retryAfter = etaSeconds === null ? 30 : Math.max(5, Math.min(60, etaSeconds));
    const eta = etaSeconds === null ? "the time left is known once the first files are in" : `about ${formatDuration(etaSeconds)} left at ${s.perSecond} files a second`;
    return { status: "indexing", kind, ...own, perSecond: s.perSecond, etaSeconds, retryAfter, hint: hint(eta) };
  }

  async function similar(upload: RgbaImage, request: IconSimilarRequest = {}): Promise<IndexSimilarResult | IconIndexProgress> {
    const { offset, limit } = searchPage(request);
    const kind = request.kind ?? "icon";
    const what = kind === "icon" ? "icons" : "textures";
    const query = request.q?.trim() ? request.q : null;
    const list = await candidates(kind, query);
    const stored = storedFiles();
    if (query === null) {
      const unread = list.filter((c) => !stored.has(c.file)).length;
      if (unread > 0) {
        return progress(
          kind,
          (eta) =>
            `The ${kind} index is being built (${list.length - unread} of ${list.length} ${what} so far; ${eta}). Retry then, or pass ` +
            `q=<words of the ${kind === "icon" ? "icon's name" : "texture's path"}> to compare only matching ${what} now ` +
            `(up to ${onDemandLimit} not yet indexed are fetched on demand). GET this URL shows the index's progress.`,
        );
      }
      if (!running && list.some((c) => stored.get(c.file) === true)) build([kind]).catch(() => {}); // try failed downloads again
    } else {
      const missing = list.filter((c) => stored.get(c.file) !== false);
      if (missing.length > onDemandLimit) {
        return progress(
          kind,
          (eta) =>
            `q matches ${list.length} ${what}, ${missing.length} of them not indexed yet; a search fetches at most ${onDemandLimit}. ` +
            `Narrow q, or retry once the index (being built now; ${eta}) has them.`,
        );
      }
      await indexAll(missing); // a file whose download failed is left out of this answer (counted in `unavailable`)
    }

    const byFile = new Map(list.map((c) => [c.file, c]));
    const rows = (
      query === null
        ? db.prepare("SELECT file, grid FROM features WHERE grid IS NOT NULL").all()
        : db.prepare("SELECT file, grid FROM features WHERE grid IS NOT NULL AND file IN (SELECT value FROM json_each(?))").all(JSON.stringify([...byFile.keys()]))
    ) as { file: string; grid: Uint8Array }[];

    const saturation = meanSaturation(upload);
    const requestedMode = request.colour ?? "auto";
    const mode = requestedMode === "auto" ? autoMode(saturation) : requestedMode;
    const matcher = textureMatcher(upload, mode, { zoomed: kind === "icon" });
    const order = (a: { match: TextureMatch; file: string }, b: { match: TextureMatch; file: string }) =>
      a.match.distance - b.match.distance || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
    const ranked = rows
      .filter((r) => byFile.has(r.file))
      .map((r) => ({ file: r.file, grid: r.grid, match: matcher.match(r.grid) }))
      .sort(order);
    // The best ones measured finely (their zoom, and a distance at most the ranking's: they stay ahead of the rest).
    const measured = ranked.slice(0, offset + limit + 20).map((r) => ({ ...r, match: matcher.measure(r.grid, r.match) })).sort(order);
    const final = [...measured, ...ranked.slice(measured.length)];
    const best = final[0]?.match.distance ?? 0;
    const close = best + Math.max(0.01, best * 0.1);
    const round = (n: number) => Math.round(n * 10000) / 10000;
    const page = final.slice(offset, offset + limit);
    const base = {
      status: "ok" as const,
      query,
      build: files.status().build,
      requestedMode,
      mode,
      saturation: round(saturation),
      offset,
      limit,
      total: ranked.length,
      unavailable: list.length - ranked.length,
      closeToBest: final.filter((r) => r.match.distance <= close).length,
    };
    if (kind === "icon") {
      return {
        ...base,
        kind,
        results: page.map(({ file, match }) => ({
          ...(byFile.get(file)!.hit as IconSearchHit),
          distance: round(match.distance),
          zoom: round(match.zoom),
          uploadInset: match.uploadInset,
        })),
      };
    }
    return {
      ...base,
      kind,
      results: page.map(({ file, match }) => ({
        ...(byFile.get(file)!.hit as { id: number | null; path: string; from: "game" | "addon" }),
        distance: round(match.distance),
        uploadInset: match.uploadInset,
      })),
    };
  }

  return { similar, build, status, close: () => db.close() };
}

/** "3 minutes", "40 seconds", "1 hour 5 minutes". */
function formatDuration(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  return `${Math.floor(minutes / 60)} hours ${minutes % 60} minutes`;
}
