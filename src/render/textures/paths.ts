import { gameFileKey } from "@/api/files";

/**
 * Where a texture comes from. A number is a Blizzard FileDataID (fetched from wago.tools).
 * A string is a game texture path as the Lua writes it (`Interface\\Buttons\\WHITE8X8`): paths under
 * `Interface\\AddOns\\` are the game's addon's own files ({@link AddonFileUrl}); any other path is a game file, found
 * by its FileDataID in the game's file list (the loader's `resolvePath`; the renderers' own textures are
 * {@link KNOWN_FILE_DATA_IDS}).
 */
export type TextureSource = number | string;

/**
 * Where the page loads a file of the game's addon at the release it follows, by its path in the addon
 * (`WeakAuras/Media/Textures/Square_White.tga`): Musca's repository on jsDelivr (Forever), the server's WeakAuras2
 * release cache (TBC). See `Game.addon.fileUrl`.
 */
export type AddonFileUrl = (path: string) => string;

/**
 * The game files the renderers draw on their own (glows, the white texture, sockets), by FileDataID, so they load
 * without asking the game's file list. Keys are `gameFileKey`s.
 */
const KNOWN_FILE_DATA_IDS: Readonly<Record<string, number>> = {
  "interface/spellactivationoverlay/iconalert": 457293,
  "interface/spellactivationoverlay/iconalertants": 457294,
  "interface/buttons/white8x8": 130871,
  "interface/itemsocketingframe/ui-itemsockets": 136264,
  "interface/adventuremap/brokenisles/am_29": 1251797,
};

const WAGO_CASC_URL = "https://wago.tools/api/casc/";

/** A game texture path's lookup key (lower case, `/`, no extension): the game's own rule, `gameFileKey`. */
export const normalizeTexturePath = gameFileKey;

/** wago.tools' download of a game file by FileDataID. */
export const fileDataIdUrl = (id: number): string => WAGO_CASC_URL + id;

/** True for a path in an addon's folder (`Interface\AddOns\…`). */
export const isAddonPath = (path: string): boolean => /^interface\/addons\//.test(gameFileKey(path));

/**
 * Candidate URLs for a texture (or another game file, such as a font), tried in order. Addon paths without an
 * extension try `.tga` then `.blp` (WoW resolves extension-less texture paths the same way). A game path the
 * renderers don't know answers `[]`: its FileDataID comes from the game's file list (the loader asks it).
 */
export function textureUrls(source: TextureSource, addonFileUrl: AddonFileUrl): string[] {
  if (typeof source === "number") return [fileDataIdUrl(source)];
  const known = KNOWN_FILE_DATA_IDS[gameFileKey(source)];
  if (known) return [fileDataIdUrl(known)];
  const addonMatch = /^interface\/addons\/(.+)$/i.exec(source.replace(/\\/g, "/").replace(/^\//, ""));
  if (addonMatch) {
    const rel = addonMatch[1];
    return /\.[a-z0-9]{3}$/i.test(rel) ? [addonFileUrl(rel)] : [addonFileUrl(rel + ".tga"), addonFileUrl(rel + ".blp")];
  }
  return [];
}
