// The renderers port Musca Auras (Forever), so its own media come from its repository; ticket 07 splits them per game.
import { muscaFileUrl } from "@/games/forever/sources";

/**
 * Where a texture comes from. A number is a Blizzard FileDataID (fetched from wago.tools).
 * A string is a game texture path as the Lua writes it (`Interface\\Buttons\\WHITE8X8`):
 * Blizzard paths are mapped to FileDataIDs through {@link KNOWN_FILE_DATA_IDS}; paths under
 * `Interface\\AddOns\\` are addon files fetched from the Musca Auras repository.
 */
export type TextureSource = number | string;

/** Blizzard texture paths used by the renderers, by FileDataID (lower case, `/`, no extension). */
const KNOWN_FILE_DATA_IDS: Readonly<Record<string, number>> = {
  "interface/spellactivationoverlay/iconalert": 457293,
  "interface/spellactivationoverlay/iconalertants": 457294,
  "interface/buttons/white8x8": 130871,
  "interface/itemsocketingframe/ui-itemsockets": 136264,
  "interface/adventuremap/brokenisles/am_29": 1251797,
};

const WAGO_CASC_URL = "https://wago.tools/api/casc/";

export function normalizeTexturePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\//, "")
    .toLowerCase()
    .replace(/\.(blp|tga)$/, "");
}

/**
 * Candidate URLs for a texture (or another game file, such as a font), tried in order. Addon paths without an
 * extension try `.tga` then `.blp` (WoW resolves extension-less texture paths the same way).
 */
export function textureUrls(source: TextureSource, addonRef: string): string[] {
  if (typeof source === "number") return [WAGO_CASC_URL + source];
  const normalized = normalizeTexturePath(source);
  const known = KNOWN_FILE_DATA_IDS[normalized];
  if (known) return [WAGO_CASC_URL + known];
  const addonMatch = /^interface\/addons\/(.+)$/i.exec(source.replace(/\\/g, "/").replace(/^\//, ""));
  if (addonMatch) {
    const rel = addonMatch[1];
    const base = muscaFileUrl(addonRef, rel);
    return /\.[a-z0-9]{3}$/i.test(rel) ? [base] : [base + ".tga", base + ".blp"];
  }
  throw new Error(`Unknown texture path (no FileDataID mapping): ${source}`);
}
