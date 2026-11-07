/**
 * Spell names and icons for the full addon VM.
 *
 * The game answers C_Spell.GetSpellInfo / GetSpellName / GetSpellTexture from its own client data.
 * The VM is synchronous Lua, so it can't ask the spell cache while the addon runs: before each call
 * that builds options or validates, the aura core collects the spell IDs the aura refers to, asks a
 * `SpellInfoSource` (the server's spell cache) for the ones it hasn't seen, and loads the answers into
 * the shim's spell table (`__shim.spells`). A spell the source doesn't know stays out of the table, so
 * the VM answers nil, as the game does for a spell ID its client doesn't have.
 */
import { isLuaTable, toLuaLiteral, type LuaValue } from "../lua-value";

/** What the game client knows about a spell: its name and icon (a FileDataID, or a texture path). */
export interface ClientSpell {
  name: string;
  icon: number | string | null;
}

/** Answers spell IDs: info, or null for a spell the client doesn't know. An ID left out of the answer is asked again later. */
export type SpellInfoSource = (ids: number[]) => Promise<Record<number, ClientSpell | null>>;

/** At most this many spell IDs are collected from one aura state. */
const MAX_IDS = 1000;
const MAX_SPELL_ID = 2 ** 31 - 1;

const SPELL_KEY = /spell/i;

function spellId(value: LuaValue | undefined): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_SPELL_ID ? n : null;
}

/**
 * Every spell ID an aura (and its group descendants) refers to: numbers or digit strings anywhere
 * under a key that names a spell (`auraspellids`, `auraRankSpellIDs`, `spellName`, `spellIds`,
 * `spellknown`, ...) and the `value` of a condition check whose `variable` names a spell.
 * Over-collecting is harmless: an ID that isn't a spell simply comes back unknown.
 */
export function collectSpellIds(auras: readonly LuaValue[]): number[] {
  const ids = new Set<number>();
  const addAll = (v: LuaValue | undefined) => {
    if (ids.size >= MAX_IDS || v === undefined || v === null) return;
    if (isLuaTable(v)) {
      for (const child of Array.isArray(v) ? v : Object.values(v)) addAll(child);
      return;
    }
    const id = spellId(v);
    if (id !== null) ids.add(id);
  };
  const walk = (v: LuaValue | undefined) => {
    if (ids.size >= MAX_IDS || !isLuaTable(v)) return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v.variable === "string" && SPELL_KEY.test(v.variable)) addAll(v.value);
    for (const [key, child] of Object.entries(v)) {
      if (SPELL_KEY.test(key)) addAll(child);
      else walk(child);
    }
  };
  auras.forEach(walk);
  return [...ids].sort((a, b) => a - b);
}

/**
 * Remembers what the source said per spell ID, and which spells each VM has been given.
 * A failing source leaves the IDs unasked, so they are retried next time (the VM answers nil meanwhile).
 */
export function createSpellPreloader(source: SpellInfoSource | undefined) {
  const known = new Map<number, ClientSpell | null>();
  const given = new WeakMap<object, Set<number>>();
  return {
    /** Asks the source about the spells these auras refer to that it hasn't been asked about. */
    async fetch(auras: readonly LuaValue[]): Promise<void> {
      if (!source) return;
      const missing = collectSpellIds(auras).filter((id) => !known.has(id));
      if (missing.length > 0) {
        try {
          const answers = await source(missing);
          for (const id of missing) {
            if (!(id in answers)) continue;
            const a = answers[id];
            known.set(id, a && typeof a.name === "string" && a.name !== "" ? { name: a.name, icon: a.icon ?? null } : null);
          }
        } catch {
          // Unknown for now; asked again on the next call.
        }
      }
    },
    /** The fetched spells `vm` hasn't been given yet for these auras: id -> info (unknown spells are left out). */
    take(vm: object, auras: readonly LuaValue[]): Record<number, ClientSpell> {
      if (!source) return {};
      const ids = collectSpellIds(auras);
      let done = given.get(vm);
      if (!done) given.set(vm, (done = new Set()));
      const out: Record<number, ClientSpell> = {};
      for (const id of ids) {
        const info = known.get(id);
        if (info && !done.has(id)) {
          out[id] = info;
          done.add(id);
        }
      }
      return out;
    },
  };
}

/** Lua that adds spells to the shim's spell table (see shim.ts). */
export function spellsToLua(spells: Record<number, ClientSpell>): string {
  const rows = Object.entries(spells).map(([id, s]) => {
    const icon = s.icon === null ? "nil" : typeof s.icon === "number" ? String(s.icon) : toLuaLiteral(s.icon);
    return `S[${Number(id)}]={id=${Number(id)},name=${toLuaLiteral(s.name)},icon=${icon}}`;
  });
  return `local S = __shim.spells ${rows.join(" ")}`;
}
