/**
 * What the full addon VM loads per game: the addon's name (for messages), its client profile (Lua run after the
 * shim, before the addon's files), the addon contract (the common part plus the game's own) and the game's own part
 * of the extractors (run after lua/extract.ts). Which .toc files load is `tocPath` (toc.ts).
 */
import { COMMON_CONTRACT, FOREVER_CONTRACT, joinContracts, type AddonContract } from "./contract";
import { FOREVER_EXTRACT_LUA } from "./lua/extract-forever";
import { CLIENT_DATA_LUA, PROFILE_LUA } from "./profile";
import { TBC_CLIENT_DATA_LUA, TBC_PROFILE_LUA } from "./profile-tbc";
import type { AddonGameId } from "./toc";

export interface AddonVMGame {
  id: AddonGameId;
  /** The addon's name in messages ("Musca Auras 1.15.0 …"). */
  addonName: string;
  /** The client profile: Lua chunks run in order after the shim and before the addon's files; they define `__profile`. */
  profileLua: string[];
  contract: AddonContract;
  /** The game's own entry points, run after lua/extract.ts (and before options.ts). */
  extractLua: string[];
  /**
   * The client restricts addons in combat, so validation gives a combat verdict (`ValidationResult.combat`) from the
   * addon's combat checks. Forever only; TBC Anniversary has no combat restrictions.
   */
  combatCheck: boolean;
}

export const ADDON_VM_GAMES: Record<AddonGameId, AddonVMGame> = {
  forever: {
    id: "forever",
    addonName: "Musca Auras",
    profileLua: [CLIENT_DATA_LUA, PROFILE_LUA],
    contract: joinContracts(COMMON_CONTRACT, FOREVER_CONTRACT),
    extractLua: [FOREVER_EXTRACT_LUA],
    combatCheck: true,
  },
  tbc: {
    id: "tbc",
    addonName: "WeakAuras",
    profileLua: [TBC_CLIENT_DATA_LUA, TBC_PROFILE_LUA],
    contract: COMMON_CONTRACT,
    extractLua: [],
    combatCheck: false,
  },
};
