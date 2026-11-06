// Sample auras as an agent would write them: only the fields that matter, no defaults.
// internalVersion is filled in by run.mjs from the loaded addon so PreAdd doesn't replay old migrations.

const arcaneIntellect = '1459';

const modernTrigger = {
  type: 'secretAura',
  unit: 'player',
  debuffType: 'HELPFUL',
  auraspellids: [arcaneIntellect],
  secretUseSpellIDs: true,
  secretShowOn: 'showOnActive',
};

export const samples = {
  // Combat-safe: "Aura (Modern)" trigger, remaining time < 180 s drives the glow only.
  'modern-icon-glow-ok': {
    id: 'Arcane Intellect low (Modern)',
    uid: 'simSample0001',
    regionType: 'icon',
    width: 48,
    height: 48,
    triggers: [{ trigger: { ...modernTrigger }, untrigger: {} }],
    subRegions: [
      { type: 'subbackground' },
      { type: 'subglow', glow: false, glowType: 'buttonOverlay' },
    ],
    conditions: [
      {
        check: { trigger: 1, variable: 'faAuraRemaining', op: '<', value: '180' },
        changes: [{ property: 'sub.2.glow', value: true }],
      },
    ],
  },
  // Known-bad: remaining-time condition drives desaturate (not allowed in combat).
  'modern-icon-desaturate-bad': {
    id: 'Arcane Intellect low desat (Modern)',
    uid: 'simSample0002',
    regionType: 'icon',
    width: 48,
    height: 48,
    triggers: [{ trigger: { ...modernTrigger }, untrigger: {} }],
    subRegions: [{ type: 'subbackground' }],
    conditions: [
      {
        check: { trigger: 1, variable: 'faAuraRemaining', op: '<', value: '180' },
        changes: [{ property: 'desaturate', value: true }],
      },
    ],
  },
  // Classic "Aura" (aura2 / BuffTrigger2) trigger with spell IDs and a remaining-time condition.
  'aura2-icon-spellids': {
    id: 'Arcane Intellect (aura2)',
    uid: 'simSample0003',
    regionType: 'icon',
    width: 48,
    height: 48,
    triggers: [
      {
        trigger: {
          type: 'aura2',
          unit: 'player',
          debuffType: 'HELPFUL',
          useExactSpellId: true,
          auraspellids: [arcaneIntellect],
          matchesShowOn: 'showOnActive',
        },
        untrigger: {},
      },
    ],
    subRegions: [{ type: 'subbackground' }],
    conditions: [
      {
        check: { trigger: 1, variable: 'expirationTime', op: '<', value: '180' },
        changes: [{ property: 'desaturate', value: true }],
      },
    ],
  },
};

/** JSON value -> Lua table constructor source. */
export function toLua(v) {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v).replace(/\\u([0-9a-f]{4})/gi, (_, h) => `\\${parseInt(h, 16)}`);
  if (Array.isArray(v)) return `{${v.map(toLua).join(',')}}`;
  return `{${Object.entries(v).map(([k, x]) => `[${/^\d+$/.test(k) ? k : JSON.stringify(k)}]=${toLua(x)}`).join(',')}}`;
}
