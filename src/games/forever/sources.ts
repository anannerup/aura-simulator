/**
 * Where Forever's addon and client data come from. Page-safe (the renderers fetch Musca Auras' own media by tag).
 *
 * - Addon: Musca Auras' released tags, loadable as they are from the GitHub repo (it commits its libraries and
 *   locales), per file via jsDelivr. A local install of v1.15.0 is at `~/Games/battlenet/drive_c/Program Files (x86)/
 *   World of Warcraft/_forever_/Interface/AddOns/WeakAuras*` (read only).
 * - Spells: wago.tools product `wowf`; Wowhead has no Forever environment, so tooltips are Classic's (`/classic/`,
 *   `dataEnv=4`).
 * - Client profile and client data: the aura core's, by game id (`src/core/addon-vm/games.ts`, `profile.ts`).
 */
import type { SpellSource } from "@/server/spells";
import { jsDelivrUrl } from "@/lib/jsdelivr";

export const FOREVER_ADDON = { repo: "dldvlpr-addons-wow/Musca-Auras", name: "Musca Auras" } as const;

export const FOREVER_SPELLS: SpellSource = { product: "wowf", wowhead: { path: "classic", dataEnv: 4 } };

/** A file of Musca Auras at a release tag on jsDelivr (`path` relative to the repo root). */
export const muscaFileUrl = (ref: string, path: string) => jsDelivrUrl(FOREVER_ADDON.repo, ref, path);
