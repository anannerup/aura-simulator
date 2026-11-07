import type { Game } from "../game";

/** The release the app uses when WeakAuras2's release list can't be read (the newest when TBC was added). */
const FALLBACK_RELEASE = "5.22.1";

/** TBC Anniversary, with official WeakAuras2 as its players install it (the release zip). */
export const tbc: Game = {
  id: "tbc",
  name: "TBC Anniversary",
  shortName: "TBC",
  addon: {
    name: "WeakAuras",
    fallbackRef: FALLBACK_RELEASE,
    // Release zips send no CORS headers, so the page reads the addon's files through the server's release cache.
    fileUrl: (ref, path) =>
      `/api/tbc/addon/${encodeURIComponent(ref)}/file?${new URLSearchParams({ path })}`,
    // OptionsFrame.lua sets WeakAurasOptionsPortrait to logo_256_round.tga (logo_256_round_pride.tga in June).
    logo: "Interface\\AddOns\\WeakAuras\\Media\\Textures\\logo_256_round.tga",
  },
  wowhead: "TBC",
};
