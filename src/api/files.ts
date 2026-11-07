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
  limit: number;
  /** How many icons match; more than `results.length` when the limit cut the list. */
  total: number;
  results: IconSearchHit[];
}
