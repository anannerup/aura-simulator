import type { Game } from "../game";

/** WoW Forever, with Musca Auras (the WeakAuras fork for it). */
export const forever: Game = {
  id: "forever",
  name: "WoW Forever",
  addon: { name: "Musca Auras", fallbackRef: "v1.15.0" },
};
