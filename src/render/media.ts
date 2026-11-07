/**
 * LibSharedMedia names the addon offers in its option lists, mapped to where the renderers load them from.
 * Blizzard files are FileDataIDs (wago.tools, IDs from the `wowf` ManifestInterfaceData export and the
 * community listfile); the addon's own files are addon paths (the game's addon source, `Game.addon.fileUrl`).
 *
 * Sources: Libs/LibSharedMedia-3.0/LibSharedMedia-3.0.lua:84-197 (western locale) and Types.lua:3250-3266.
 */
import { getField, type AuraDocument, type LuaTable, type LuaValue } from "@/core";
import type { TextureSource } from "./textures/paths";

const ADDON = "Interface\\AddOns\\WeakAuras\\Media\\";

/** The game's addon's own UI media (toolbar and footer icons), fetched at runtime from the game's addon source and never committed. */
export const ADDON_MEDIA = (name: string): string => `${ADDON}Textures\\${name}`;

/** LSM "statusbar" (LibSharedMedia-3.0.lua:194-197, Types.lua:3262-3265). */
export const STATUSBAR_TEXTURES: Readonly<Record<string, TextureSource>> = {
  Blizzard: 137012, // Interface\TargetingFrame\UI-StatusBar
  "Blizzard Character Skills Bar": 136570, // Interface\PaperDollInfoFrame\UI-Character-Skills-Bar
  "Blizzard Raid Bar": 423819, // Interface\RaidFrame\Raid-Bar-Hp-Fill
  Solid: 130871, // Interface\Buttons\WHITE8X8
  Clean: `${ADDON}Textures\\Statusbar_Clean`,
  Stripes: `${ADDON}Textures\\Statusbar_Stripes`,
  "Thick Stripes": `${ADDON}Textures\\Statusbar_Stripes_Thick`,
  "Thin Stripes": `${ADDON}Textures\\Statusbar_Stripes_Thin`,
};

/** LSM "border" (LibSharedMedia-3.0.lua:84-90, Types.lua:3260, 3266). `null`: draws nothing. */
export const BORDER_EDGES: Readonly<Record<string, TextureSource | null>> = {
  None: null,
  "Square Full White": `${ADDON}Textures\\Square_FullWhite.tga`,
  "Drop Shadow": `${ADDON}Textures\\Border_DropShadow`,
  "Blizzard Achievement Wood": 130672,
  "Blizzard Chat Bubble": 137050,
  "Blizzard Dialog": 131072,
  "Blizzard Dialog Gold": 131076,
  "Blizzard Party": 130931,
  "Blizzard Tooltip": 137057,
};

/** Interface\CastingBar\UI-CastingBar-Spark: the default spark and tick texture (AuraBar.lua:33, Tick.lua:19). */
export const CASTING_BAR_SPARK = 130877;

export interface FontFile {
  /** A Blizzard FileDataID (wago.tools) or an addon file path. */
  source: number | string;
  /** Web fonts that look alike, used until (or if) the game font loads. */
  fallback: string;
}

/**
 * LSM "font" for the western client (LibSharedMedia-3.0.lua:176-188: FRIZQT__.TTF, not the _CYR files) and the
 * fonts Musca Auras registers (Types.lua:3250-3257). FileDataIDs from the community listfile (fonts/*.ttf).
 */
export const FONTS: Readonly<Record<string, FontFile>> = {
  "Friz Quadrata TT": { source: 615960, fallback: '"Friz Quadrata", "Albertus", Georgia, serif' },
  "Arial Narrow": { source: 615958, fallback: '"Arial Narrow", "Liberation Sans Narrow", "Roboto Condensed", Arial, sans-serif' },
  Skurri: { source: 615961, fallback: 'Georgia, "Times New Roman", serif' },
  Morpheus: { source: 615962, fallback: '"Uncial Antiqua", Georgia, serif' },
  "Nimrod MT": { source: 615967, fallback: 'Georgia, "Times New Roman", serif' },
  "2002": { source: 615966, fallback: "sans-serif" },
  "2002 Bold": { source: 615968, fallback: "sans-serif" },
  MoK: { source: 615972, fallback: "sans-serif" },
  "Fira Mono Medium": { source: `${ADDON}Fonts\\FiraMono-Medium.ttf`, fallback: '"Fira Mono", monospace' },
  "Fira Sans Black": { source: `${ADDON}Fonts\\FiraSans-Heavy.ttf`, fallback: '"Fira Sans", sans-serif' },
  "Fira Sans Condensed Black": { source: `${ADDON}Fonts\\FiraSansCondensed-Heavy.ttf`, fallback: '"Fira Sans Condensed", sans-serif' },
  "Fira Sans Condensed Medium": { source: `${ADDON}Fonts\\FiraSansCondensed-Medium.ttf`, fallback: '"Fira Sans Condensed", sans-serif' },
  "Fira Sans Medium": { source: `${ADDON}Fonts\\FiraSans-Medium.ttf`, fallback: '"Fira Sans", sans-serif' },
  "PT Sans Narrow Regular": { source: `${ADDON}Fonts\\PTSansNarrow-Regular.ttf`, fallback: '"PT Sans Narrow", sans-serif' },
  "PT Sans Narrow Bold": { source: `${ADDON}Fonts\\PTSansNarrow-Bold.ttf`, fallback: '"PT Sans Narrow", sans-serif' },
};

/** WeakAuras.defaultFont (DefaultOptions.lua:3); also STANDARD_TEXT_FONT, the game's fallback. */
export const DEFAULT_FONT = "Friz Quadrata TT";

/**
 * A texture as an aura stores it: a FileDataID (number or numeric string) or a game path. Atlas names are not
 * drawn (texture regions label them instead).
 */
export function textureSourceOf(value: LuaValue | undefined): TextureSource | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const s = value.trim();
  if (/^\d+$/.test(s)) return Number(s);
  return /[\\/]/.test(s) ? s : null;
}

/** AuraBar.lua:1050-1058 UpdateStatusBarTexture: "Picker" uses textureInput, else the LSM name in `texture`. */
export function statusBarTexture(aura: AuraDocument): TextureSource | null {
  if (aura.textureSource === "Picker") return textureSourceOf(aura.textureInput);
  const name = typeof aura.texture === "string" ? aura.texture : "Blizzard";
  return STATUSBAR_TEXTURES[name] ?? textureSourceOf(name);
}

export function borderEdge(element: LuaTable): TextureSource | null {
  const name = getField(element, "border_edge");
  const key = typeof name === "string" ? name : "Square Full White";
  if (key in BORDER_EDGES) return BORDER_EDGES[key];
  return textureSourceOf(name);
}
