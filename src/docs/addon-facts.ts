/**
 * Facts the agent docs read from the selected addon version: its registries (region and sub-region types,
 * trigger types, the Aura (Modern) tables), its defaults (`fillDefaults`) and its own combat verdicts
 * (`validate` on a probe aura per trigger). So the docs follow addon updates without hand edits.
 */
import type { AuraCore, AuraDocument, CombatStatus, LuaObject, LuaValue, Registries } from "@/core";

export interface TriggerFact {
  /** The trigger's `type` (e.g. "spell"). */
  type: string;
  /** Its `event` (e.g. "Cooldown Progress (Spell)"), for types that have them. */
  event?: string;
  /** The options window's name for it. */
  name: string;
  /** What the addon's validation says about a probe aura with this trigger and its default options. */
  combat: CombatStatus;
  message: string;
}

export interface ConditionFact {
  variable: string;
  label: string;
  combat: CombatStatus;
}

export interface ModernVariableFact {
  variable: string;
  label: string;
  family: string;
  operators: string[];
  /** The variable may light a glow (with this operator, if any). */
  glow?: { operator?: string };
}

export interface AddonFacts {
  addonRef: string;
  addonVersion: string;
  internalVersion: number;
  regionTypes: string[];
  subRegionTypes: { type: string; displayName: string; supports: string[] }[];
  /** Region types an Aura (Modern) trigger can drive. */
  modernRegionTypes: string[];
  triggers: TriggerFact[];
  /** "Cooldown Progress (Spell)" condition variables with the addon's combat verdict for each. */
  cooldownConditions: ConditionFact[];
  modern: {
    units: Record<string, string>;
    singleUnits: string[];
    showOn: Record<string, string>;
    nativeFilters: { key: string; label: string; description: string }[];
    remOperators: string[];
    stackOperators: string[];
    stackLimit: number;
    missingRegionTypes: string[];
    /** Root properties a Missing condition may drive, per region type (AuraDisplay.missingRootProperties). */
    missingRootProperties: Record<string, string[]>;
    variables: ModernVariableFact[];
    /** Root properties per region type that Aura (Modern) conditions know, with their value type. */
    rootProperties: Record<string, Record<string, string>>;
    /** Sub-element properties per element type: value type and whether a Missing condition may drive it. */
    elementProperties: Record<string, Record<string, { type: string; missing: boolean; literalOnly: boolean }>>;
    /** Root properties only "plain"/"select" checks drive (the native highlight). */
    highlightProperties: string[];
  };
  /** Properties conditions can change per region type, key → options window name (non-sub-element). */
  conditionProperties: Record<string, Record<string, string>>;
  /** Region documents after `fillDefaults` (top-level scalars and colours only). */
  regionDefaults: Record<string, LuaObject>;
  /** Sub-element defaults on an icon (aurabar for subtick/subforeground). */
  subDefaults: Record<string, LuaObject>;
}

export const DOCUMENTED_REGION_TYPES = ["icon", "aurabar", "text", "group", "dynamicgroup"] as const;
export const DOCUMENTED_SUB_TYPES = ["subtext", "subglow", "subborder", "subtick", "subbackground", "subforeground"] as const;

/** Fields `fillDefaults` adds that an agent never sets by hand. */
const BOOKKEEPING = new Set(["id", "uid", "internalVersion", "regionType", "blizzardAuraDisplay", "progressSource", "subRegions", "controlledChildren"]);

const SIMPLE_TRIGGERS: { name: string; trigger: LuaObject }[] = [
  { name: "Aura (Modern), player buff by spell ID", trigger: { type: "secretAura", unit: "player", debuffType: "HELPFUL", auraspellids: ["1459"] } },
  {
    name: "Aura (Modern), own debuff on the target",
    trigger: { type: "secretAura", unit: "target", debuffType: "HARMFUL", auraspellids: ["172"], nativeFilters: { PLAYER: true } },
  },
  {
    name: "Aura (aura2) by spell ID or name",
    trigger: { type: "aura2", unit: "player", debuffType: "HELPFUL", useExactSpellId: true, auraspellids: ["1459"] },
  },
  {
    name: "Aura (aura2) with only a native filter (no names, no spell IDs)",
    trigger: { type: "aura2", unit: "target", debuffType: "HARMFUL", useNativeFilter: true, nativeFilter: { PLAYER: true } },
  },
  { name: "Custom (status, every frame)", trigger: { type: "custom", custom_type: "status", check: "update", custom: "function() return true end" } },
];

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const keysOf = (v: unknown): string[] => Object.keys(asRecord(v)).sort();
/** A Lua sequence from the VM: an array, or {} when empty. */
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : Object.values(asRecord(v)));
const stripColor = (s: string) => s.replace(/\|c\w{8}|\|r|\|T[^|]*\|t/g, "");
/** An options-window name: a string or a list of parts (non-strings are flags, not words). */
const displayName = (d: unknown, fallback: string) =>
  stripColor(Array.isArray(d) ? d.filter((x) => typeof x === "string").join(" ") : typeof d === "string" ? d : fallback);

function probe(trigger: LuaObject, conditions: LuaValue = []): { aura: AuraDocument; children: AuraDocument[] } {
  return {
    aura: { id: "probe", regionType: "icon", triggers: { "[1]": { trigger, untrigger: {} }, activeTriggerMode: -10 }, conditions },
    children: [],
  };
}

function simpleDefaults(doc: LuaObject): LuaObject {
  const out: LuaObject = {};
  for (const [k, v] of Object.entries(doc).sort(([a], [b]) => a.localeCompare(b))) {
    if (BOOKKEEPING.has(k)) continue;
    const isColour = Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === "number");
    if (typeof v !== "object" || isColour) out[k] = v;
  }
  return out;
}

/** Reads everything the docs generate from one loaded addon version (a few hundred ms). */
export async function collectAddonFacts(core: AuraCore): Promise<AddonFacts> {
  const r: Registries = await core.registries();
  const secret = asRecord(r.secretAura);
  const regionTypes = keysOf(r.regionTypes);
  const subTypes = asRecord(r.subRegionTypes);
  const categories = asRecord(r.eventCategories);
  const prototypes = asRecord(r.eventPrototypes);

  const verdict = async (state: { aura: AuraDocument; children: AuraDocument[] }) => {
    const v = await core.validate(state);
    return { combat: v.combat.status, message: v.combat.messages.join(" ") };
  };

  const triggers: TriggerFact[] = [];
  for (const { name, trigger } of SIMPLE_TRIGGERS) triggers.push({ type: String(trigger.type), name, ...(await verdict(probe(trigger))) });
  for (const [event, p] of Object.entries(prototypes).sort(([a], [b]) => a.localeCompare(b))) {
    const proto = asRecord(p);
    const type = String(proto.type);
    const category = asRecord(categories[type]).name;
    const name = `${category ? `${category}: ` : ""}${stripColor(String(proto.name ?? event))}`;
    triggers.push({ type, event, name, ...(await verdict(probe({ type, event }))) });
  }

  const cooldownEvent = "Cooldown Progress (Spell)";
  const cooldownTrigger: LuaObject = { type: "spell", event: cooldownEvent, spellName: 2136, genericShowOn: "showAlways", use_genericShowOn: true };
  const cooldownConditions: ConditionFact[] = [];
  const cooldownArgs = (asRecord(prototypes[cooldownEvent]).args as Record<string, unknown>[] | undefined) ?? [];
  const conditionArgs = cooldownArgs
    .filter((a) => typeof a.name === "string" && typeof a.conditionType === "string")
    .map((a) => ({ variable: String(a.name), label: displayName(a.display, String(a.name)), type: String(a.conditionType) }));
  // Every timed trigger also offers its progress (WeakAuras' "Remaining Duration"/"Total Duration").
  conditionArgs.push({ variable: "expirationTime", label: "Remaining Duration", type: "timer" }, { variable: "duration", label: "Total Duration", type: "number" });
  for (const arg of conditionArgs) {
    const value = arg.type === "bool" ? 1 : arg.type === "string" ? "x" : 3;
    const op = arg.type === "bool" ? undefined : arg.type === "string" ? "==" : "<";
    const check: LuaObject = { trigger: 1, variable: arg.variable, value };
    if (op) check.op = op;
    const { combat } = await verdict(probe(cooldownTrigger, [{ check, changes: [{ property: "desaturate", value: true }] }]));
    cooldownConditions.push({ variable: arg.variable, label: arg.label, combat });
  }

  const variables: ModernVariableFact[] = Object.entries(asRecord(secret.VARIABLES))
    .map(([variable, raw]) => {
      const v = asRecord(raw);
      const glow = v.glow ? { operator: asRecord(v.glow).operator as string | undefined } : undefined;
      return { variable, label: String(v.label ?? variable), family: String(v.family), operators: keysOf(v.operators), glow };
    })
    .sort((a, b) => a.variable.localeCompare(b.variable));

  const elementProperties: AddonFacts["modern"]["elementProperties"] = {};
  for (const [element, props] of Object.entries(asRecord(secret.ELEMENT_PROPERTIES))) {
    elementProperties[element] = {};
    for (const [key, raw] of Object.entries(asRecord(props))) {
      const p = asRecord(raw);
      elementProperties[element][key] = { type: String(p.type), missing: p.missing === true, literalOnly: p.literalOnly === true };
    }
  }

  const conditionProperties: AddonFacts["conditionProperties"] = {};
  for (const name of DOCUMENTED_REGION_TYPES) {
    const props = asRecord(asRecord(asRecord(r.regionTypes)[name]).properties);
    conditionProperties[name] = Object.fromEntries(
      Object.entries(props)
        .map(([k, raw]) => {
          return [k, displayName(asRecord(raw).display, k)] as const;
        })
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  const regionDefaults: AddonFacts["regionDefaults"] = {};
  for (const regionType of DOCUMENTED_REGION_TYPES) {
    const group = regionType === "group" || regionType === "dynamicgroup";
    const aura: AuraDocument = group
      ? { id: "defaults", regionType }
      : { id: "defaults", regionType, triggers: { "[1]": { trigger: SIMPLE_TRIGGERS[0].trigger, untrigger: {} }, activeTriggerMode: -10 } };
    regionDefaults[regionType] = simpleDefaults((await core.fillDefaults({ aura, children: [] })).aura);
  }
  const subDefaults: AddonFacts["subDefaults"] = {};
  for (const sub of DOCUMENTED_SUB_TYPES) {
    const defaults = asRecord(asRecord(subTypes[sub]).defaults);
    subDefaults[sub] = asRecord(defaults.icon ?? defaults.aurabar) as LuaObject;
  }

  const listOfTriples = (v: unknown) =>
    (Array.isArray(v) ? v : []).map((row) => {
      const [key, label, description] = row as string[];
      return { key, label, description };
    });

  return {
    addonRef: core.ref,
    addonVersion: core.addonVersion,
    internalVersion: core.internalVersion,
    regionTypes,
    subRegionTypes: Object.entries(subTypes)
      .map(([type, raw]) => {
        const s = asRecord(raw);
        return { type, displayName: String(s.displayName ?? type), supports: listOf(s.supports).map(String) };
      })
      .sort((a, b) => a.type.localeCompare(b.type)),
    modernRegionTypes: listOf(secret.supportedRegionTypes).map(String),
    triggers,
    cooldownConditions,
    modern: {
      units: asRecord(secret.units) as Record<string, string>,
      singleUnits: keysOf(secret.singleUnits),
      showOn: asRecord(secret.showOnValues) as Record<string, string>,
      nativeFilters: listOfTriples(secret.nativeFilters),
      remOperators: keysOf(secret.remOperators),
      stackOperators: keysOf(secret.stackOperators),
      stackLimit: Number(secret.STACK_LIMIT ?? 0),
      missingRegionTypes: keysOf(secret.missingTypes),
      missingRootProperties: Object.fromEntries(
        Object.entries(asRecord(secret.missingRootProperties)).map(([region, names]) => [region, keysOf(names)]),
      ),
      variables,
      rootProperties: asRecord(secret.ROOT_PROPERTIES) as Record<string, Record<string, string>>,
      elementProperties,
      highlightProperties: keysOf(secret.HIGHLIGHT_SET),
    },
    conditionProperties,
    regionDefaults,
    subDefaults,
  };
}
