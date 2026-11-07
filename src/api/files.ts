/**
 * Wire types of the game file API (`/api/<game>/files`, `/api/<game>/icons/search`), shared by the server and the page.
 * A game's file list is its client's ManifestInterfaceData (wago.tools, the game's product and build): every file
 * under `Interface\` with its FileDataID. No server code here.
 */

/** One game file: its FileDataID and its path as the client names it (`Interface\ICONS\INV_Misc_Rune_01.blp`). */
export interface GameFile {
  id: number;
  path: string;
}

/**
 * The key a game path is looked up by: lower case, `/` separators, no leading slash, no `.blp`/`.tga` extension.
 * The game resolves texture paths case-insensitively and without their extension, so `Interface\Cursor\Cast`,
 * `interface/cursor/cast.blp` and `INTERFACE\CURSOR\CAST.BLP` are the same file.
 */
export function gameFileKey(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\//, "")
    .toLowerCase()
    .replace(/\.(blp|tga)$/, "");
}

/** `Interface\Icons\<name>` (any case, `/` or `\`, optional `.blp`): the icon's name, lower case; else null. */
export function iconNameOfPath(path: string): string | null {
  const m = /^interface\/icons\/([^/]+)$/.exec(gameFileKey(path));
  return m ? m[1] : null;
}

/** An icon's path as an aura writes it (`Interface\Icons\INV_Misc_Rune_01`), from the client's (`Interface\ICONS\INV_Misc_Rune_01.blp`). */
export function auraIconPath(clientPath: string): string {
  return `Interface\\Icons\\${clientPath.replace(/^.*[\\/]/, "").replace(/\.blp$/i, "")}`;
}

/** `GET /api/<game>/files?path=…&id=…` */
export interface FileLookupResult {
  /** The game build the file list is from. */
  build: string | null;
  /** By each requested path, as given: the file, or null when the game has no such file. */
  paths: Record<string, GameFile | null>;
  /** By each requested FileDataID. */
  ids: Record<string, GameFile | null>;
}

/** One hit of an icon search. */
export interface IconSearchHit {
  /** FileDataID: what `displayIcon` and texture options take. */
  id: number;
  /** Icon name, lower case, no extension (Wowhead's image name). */
  name: string;
  /** The path to write in an aura: `Interface\Icons\INV_Misc_Food_86_Basilisk`. */
  path: string;
  iconUrl: string;
}

export interface IconSearchResult {
  query: string;
  build: string | null;
  /** The results skipped (the request's `offset`, 0 by default): page with `offset` += `limit` while it is below `total`. */
  offset: number;
  /** The most results answered (the request's `limit`, 1-100; 20 by default). */
  limit: number;
  /** How many icons match in all; more than `results.length` when the page cut the list. */
  total: number;
  results: IconSearchHit[];
}

/** How `POST /api/<game>/icons/similar` compares: `colour` (RGB), `grey` (luminance only), `auto` (grey for a nearly unsaturated upload). */
export type IconColourMode = "auto" | "colour" | "grey";

/**
 * What `POST /api/<game>/icons/similar` compares the upload with: the game's icons (`Interface\Icons\`, the default),
 * or every other texture: the game's other texture files and the addon's own (`Interface\AddOns\…`).
 */
export type TextureKind = "icon" | "texture";
export const TEXTURE_KINDS: readonly TextureKind[] = ["icon", "texture"];

/** `GET /api/<game>/textures/picture.png?path=`: a PNG of any texture (a game path, a FileDataID or an addon path). */
export function texturePictureUrl(origin: string, game: string, path: string | number): string {
  return `${origin}/api/${game}/textures/picture.png?${new URLSearchParams({ path: String(path) })}`;
}

/** How a texture matched the upload. */
export interface TextureFit {
  /** Root-mean-square difference of 8×8 cell averages, 0..1 (0 = alike). Lower is better. */
  distance: number;
  /** The fraction cut off each edge of the upload at the best match (a border over the art, or background around it). */
  uploadInset: number;
  /** A PNG of the texture (`texturePictureUrl`), to look at. */
  pictureUrl: string;
}

/** One hit of an icon similarity search: an icon and how close it looks to the upload. */
export interface IconSimilarHit extends IconSearchHit, TextureFit {
  /** The WeakAuras icon `zoom` (0-1) the upload shows the icon at (Icon.lua cuts `zoom / 4` off each edge of the art). */
  zoom: number;
}

/** One hit of a texture similarity search (`kind=texture`). */
export interface TextureSimilarHit extends TextureFit {
  /** FileDataID of a game file; null for the addon's own. */
  id: number | null;
  /** The path to write in an aura, no extension (`Interface\Cursor\Cast`, `Interface\AddOns\WeakAuras\Media\Textures\Square_White`). */
  path: string;
  from: "game" | "addon";
}

interface SimilarResultBase {
  status: "ok";
  /** The name filter (`q`), or null when every icon (or texture) of the game was compared. */
  query: string | null;
  build: string | null;
  /** The mode asked for and the one used (`auto` becomes `colour` or `grey`). */
  requestedMode: IconColourMode;
  mode: "colour" | "grey";
  /** The upload's mean saturation (0..1); `auto` picks grey below 0.06. */
  saturation: number;
  offset: number;
  limit: number;
  /** How many icons were compared (those the name filter matched whose pixels could be read). */
  total: number;
  /** Icons that matched the filter but couldn't be compared (no such file on wago.tools, unreadable, or a fetch failed). */
  unavailable: number;
  /**
   * How many compared icons are within 0.01 (or 10%) of the best distance. Above 1 the best match isn't clear:
   * icons of one family can differ only in colour, so in grey mode especially, check these by `iconUrl`.
   */
  closeToBest: number;
}

/** `POST /api/<game>/icons/similar`: icons ranked by how alike they look to the upload, best first. */
export interface IconSimilarResult extends SimilarResultBase {
  kind: "icon";
  results: IconSimilarHit[];
}

/** `POST /api/<game>/icons/similar?kind=texture`: the other textures, ranked the same way. */
export interface TextureSimilarResult extends SimilarResultBase {
  kind: "texture";
  results: TextureSimilarHit[];
}

export type SimilarResult = IconSimilarResult | TextureSimilarResult;

/** How far the index of one kind is: files read (or known unreadable), files whose download failed (retried), all. */
export interface IndexCount {
  indexed: number;
  failed: number;
  total: number;
}

/** The icon index's state: `GET /api/<game>/icons/similar`. */
export interface IconIndexStatus {
  icons: IndexCount;
  textures: IndexCount;
  /** The kind being indexed now, or null when idle. */
  building: TextureKind | null;
  /** Files indexed per second in the current build (null before the first). */
  perSecond: number | null;
  /** The last download or build problem, if any (failed downloads are tried again). */
  lastError: string | null;
}

/** `POST /api/<game>/icons/similar` (202): the index is still being built; retry later or pass `q`. */
export interface IconIndexProgress extends IndexCount {
  status: "indexing";
  kind: TextureKind;
  perSecond: number | null;
  /** Estimated seconds until every file of `kind` is indexed (null until the speed is known). */
  etaSeconds: number | null;
  /** Seconds to wait before asking again. */
  retryAfter: number;
  hint: string;
}
