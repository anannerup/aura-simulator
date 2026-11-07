/**
 * Where TBC Anniversary's client data comes from (the game itself arrives in ticket 04).
 *
 * - Spells: wago.tools product `wow_anniversary`, Wowhead TBC (`/tbc/`, `dataEnv=5`).
 * - Client profile and client data: the aura core's (`src/core/addon-vm/games.ts`, `profile-tbc.ts`).
 */
import type { SpellSource } from "@/server/spells";

export const TBC_SPELLS: SpellSource = { product: "wow_anniversary", wowhead: { path: "tbc", dataEnv: 5 } };
