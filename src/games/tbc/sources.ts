/**
 * Where TBC Anniversary's addon and client data come from.
 *
 * - Addon: official WeakAuras2's GitHub release zips, from 5.21.0 (the first with TBC Anniversary support), served by
 *   the server's release cache (`src/server/addon/weakauras2-releases.ts`); the client loads its `_TBC.toc` file sets.
 * - Spells: wago.tools product `wow_anniversary`, Wowhead TBC (`/tbc/`, `dataEnv=5`).
 * - Client profile and client data: the aura core's (`src/core/addon-vm/games.ts`, `profile-tbc.ts`).
 */
import type { SpellSource } from "@/server/spells";

export const TBC_SPELLS: SpellSource = { product: "wow_anniversary", wowhead: { path: "tbc", dataEnv: 5 } };
