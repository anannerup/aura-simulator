import type { Game } from "../game";
import { muscaFileUrl } from "./sources";

/** WoW Forever, with Musca Auras (the WeakAuras fork for it). */
export const forever: Game = {
  id: "forever",
  name: "WoW Forever",
  shortName: "Forever",
  addon: {
    name: "Musca Auras",
    fallbackRef: "v1.15.0",
    // Musca's released tags load as they are from its repository (jsDelivr sends CORS headers).
    fileUrl: muscaFileUrl,
    logo: "Interface\\AddOns\\WeakAuras\\Media\\Textures\\logo_musca_round",
  },
  // Wowhead has no Forever environment; tooltips are Classic's (FOREVER_SPELLS).
  wowhead: "Classic",
};
