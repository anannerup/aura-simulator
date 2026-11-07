/**
 * Facts TBC's agent docs read from the selected WeakAuras2 release (its registries in the full addon VM), so the docs
 * follow the addon without hand edits. Per game: Forever's (`src/games/forever/docs/addon-facts.ts`) reads Musca's
 * Aura (Modern) tables and combat verdicts, which WeakAuras2 doesn't have.
 */
import { plainText, type AuraCore } from "@/core";

export interface TbcAddonFacts {
  addonRef: string;
  addonVersion: string;
  internalVersion: number;
  regionTypes: string[];
  subRegionTypes: { type: string; displayName: string; supports: string[] }[];
  /** Trigger types (`trigger.type`) with the events (`trigger.event`) the addon offers for each, by options name. */
  triggers: { type: string; events: { event: string; name: string }[] }[];
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
/** A Lua sequence from the VM: an array, or {} when empty. */
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : Object.values(asRecord(v)));

export async function collectTbcAddonFacts(core: AuraCore): Promise<TbcAddonFacts> {
  const r = await core.registries();
  const byType = new Map<string, { event: string; name: string }[]>();
  for (const type of listOf(r.triggerTypes).map(String)) byType.set(type, []);
  for (const [event, raw] of Object.entries(asRecord(r.eventPrototypes))) {
    const proto = asRecord(raw);
    const type = String(proto.type);
    byType.set(type, [...(byType.get(type) ?? []), { event, name: plainText(String(proto.name ?? event)) }]);
  }
  return {
    addonRef: core.ref,
    addonVersion: core.addonVersion,
    internalVersion: core.internalVersion,
    regionTypes: Object.keys(asRecord(r.regionTypes)).sort(),
    subRegionTypes: Object.entries(asRecord(r.subRegionTypes))
      .map(([type, raw]) => {
        const s = asRecord(raw);
        return { type, displayName: String(s.displayName ?? type), supports: listOf(s.supports).map(String) };
      })
      .sort((a, b) => a.type.localeCompare(b.type)),
    triggers: [...byType]
      .map(([type, events]) => ({ type, events: events.sort((a, b) => a.event.localeCompare(b.event)) }))
      .sort((a, b) => a.type.localeCompare(b.type)),
  };
}
