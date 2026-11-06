import type { ClientSpell } from "@/core";
import type { SpellCache } from "@/server/spells";

/** At most this many spell IDs per request. */
export const MAX_CLIENT_SPELL_IDS = 500;

/**
 * What the Forever client knows about these spells, for the addon VM's C_Spell.GetSpellInfo and friends:
 * the synced Forever spell list's name and icon FileDataID (a texture path when only the icon name is
 * known). A spell missing from Forever's list is unknown (null), as in the game. Before the spell cache
 * has been synced, Wowhead's cached name and icon stand in. No network.
 */
export async function clientSpells(cache: SpellCache, ids: readonly number[]): Promise<Record<number, ClientSpell | null>> {
  const out: Record<number, ClientSpell | null> = {};
  for (const id of ids.slice(0, MAX_CLIENT_SPELL_IDS)) {
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const spell = await cache.lookup(id, { fetchWowhead: false });
    const iconPath = (name: string | null) => (name ? `Interface\\Icons\\${name}` : null);
    if (spell.forever) {
      out[id] = { name: spell.forever.name, icon: spell.forever.iconFileId ?? iconPath(spell.forever.icon) };
    } else if (spell.flags.includes("not-synced") && spell.name) {
      out[id] = { name: spell.name, icon: iconPath(spell.icon) };
    } else {
      out[id] = null;
    }
  }
  return out;
}
