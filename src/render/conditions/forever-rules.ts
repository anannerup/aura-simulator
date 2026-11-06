/**
 * Forever's combat restrictions and the fork's "Aura (Modern)" (`secretAura`) condition rules, restated
 * from Musca Auras v1.15.0. This is the one place these rules live; each cites the Lua it mirrors
 * (paths relative to the addon's `WeakAuras/` folder). If those files change, re-check this module.
 */
import { entries, getField, isLuaTable, type AuraDocument, type LuaTable, type LuaValue } from "@/core";
import { auraTriggers, type TriggerInfo } from "../situation";

// ---------------------------------------------------------------------------------------------
// Small readers
// ---------------------------------------------------------------------------------------------

export function list(value: LuaValue | undefined): LuaValue[] {
  if (!isLuaTable(value)) return [];
  return entries(value)
    .filter(([k]) => typeof k === "number")
    .sort(([a], [b]) => (a as number) - (b as number))
    .map(([, v]) => v);
}

export function field(table: LuaValue | undefined, key: string | number): LuaValue | undefined {
  return isLuaTable(table) ? getField(table, key) : undefined;
}

export function finite(value: LuaValue | undefined): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export type Comparison = "<" | "<=" | ">" | ">=" | "==" | "~=";

export function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "==":
    case "=":
      return a === b;
    case "~=":
      return a !== b;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Aura (Modern): show on, remaining window, stack filter
// ---------------------------------------------------------------------------------------------

export type SecretShowOn = "showOnActive" | "showOnMissing" | "showAlways";

/** SecretAuraSingle.lua:110 RawShowOn: unknown values mean "Aura(s) Found". */
export function secretShowOn(trigger: LuaTable): SecretShowOn {
  const value = getField(trigger, "secretShowOn");
  return value === "showOnMissing" || value === "showAlways" ? value : "showOnActive";
}

/**
 * SecretAuraSingle.lua:121-131 UsesRemaining/RemainingWindow: the Remaining Time window only exists with
 * Show On "Aura(s) Found", an operator out of < <= > >= (:94) and a finite secretRem >= 0.
 */
export function secretRemainingWindow(trigger: LuaTable): { op: string; seconds: number } | undefined {
  if (getField(trigger, "secretUseRem") !== true || secretShowOn(trigger) !== "showOnActive") return undefined;
  const opValue = getField(trigger, "secretRemOperator");
  const op = typeof opValue === "string" ? opValue : "<";
  if (!["<", "<=", ">", ">="].includes(op)) return undefined;
  const seconds = finite(getField(trigger, "secretRem"));
  return seconds !== undefined && seconds >= 0 ? { op, seconds } : undefined;
}

/** SecretAuraSingle.lua:149 InRemainingWindow. Remaining time only counts while the aura is up. */
export function inRemainingWindow(remaining: number, op: string, seconds: number): boolean {
  return compare(remaining, op, seconds);
}

/**
 * SecretAuraSingleGates.lua:62-112 StackFilter/StackGate: secretUseStacks with a whole secretStacks 0..100
 * (STACK_LIMIT, SecretAuraSingle.lua:97); only with Show On "Aura(s) Found" and no Remaining Time window
 * (IsSingle, SecretAuraSingle.lua:137). Returns undefined when the filter is off or unusable.
 */
export function secretStackFilter(trigger: LuaTable): ((stacks: number) => boolean) | undefined {
  if (getField(trigger, "secretUseStacks") !== true) return undefined;
  if (secretShowOn(trigger) !== "showOnActive" || secretRemainingWindow(trigger)) return undefined;
  const count = finite(getField(trigger, "secretStacks"));
  if (count === undefined || !Number.isInteger(count) || count < 0 || count > 100) return undefined;
  const opValue = getField(trigger, "secretStacksOperator");
  const op = typeof opValue === "string" ? opValue : ">=";
  if (!["=", ">=", ">", "<=", "<"].includes(op)) return undefined;
  return (stacks) => compare(stacks, op, count);
}

// ---------------------------------------------------------------------------------------------
// Freezing under the combat restriction (padlock)
// ---------------------------------------------------------------------------------------------

/**
 * Whether an "Aura" (aura2) trigger keeps its last state under the combat restriction.
 * BuffTrigger2.lua:3417 AuraTriggerFreezes = not acceptsSecretAuras, and BuffTrigger2.lua:3376:
 * `acceptsSecretAuras = onlyNativeFilter and not names and not auraspellids and not trigger.fetchTooltip`.
 * `onlyNativeFilter` (createScanFunc, BuffTrigger2.lua:2923-2945) needs a native filter
 * (BuffTriggerNativeFilter.lua:16: useNativeFilter with at least one token, unit ~= "multi", and a trigger
 * that can match-check, i.e. not a single-unit Show On Missing, BuffTrigger2.lua:218) and no other checks.
 * Names and spell IDs count when used (useName + auranames, useExactSpellId + auraspellids, :3263/:3338).
 */
export function aura2Freezes(trigger: LuaTable): boolean {
  const g = (k: string) => getField(trigger, k);
  const unit = g("unit");
  const group = ["group", "party", "raid", "boss", "nameplate", "arena", "multi"].includes(String(unit));
  const showOn = g("matchesShowOn");
  const canMatchCheck =
    group || showOn === undefined || showOn === "showOnActive" || showOn === "showOnMatches"
      ? true
      : showOn === "showOnMissing"
        ? false
        : g("showClones") === true;
  const hasTokens = (t: LuaValue | undefined) =>
    isLuaTable(t) && entries(t).some(([, enabled]) => enabled === true);
  const nativeFilter =
    canMatchCheck && g("useNativeFilter") === true && unit !== "multi" && (hasTokens(g("nativeFilter")) || hasTokens(g("nativeFilterNot")));
  const single = canMatchCheck && unit !== "multi";
  const otherChecks =
    (single && g("useStacks") === true) ||
    (single && (g("use_stealable") !== undefined || g("use_isBossDebuff") !== undefined || g("use_castByPlayer") !== undefined)) ||
    (single && g("use_debuffClass") === true) ||
    g("ownOnly") !== undefined ||
    (single && g("fetchTooltip") === true && (g("use_tooltip") === true || g("use_tooltipValue") === true)) ||
    g("useNamePattern") === true ||
    (single && g("useTotal") === true && g("total") !== undefined) ||
    (single && g("useIgnoreName") === true && g("ignoreAuraNames") !== undefined) ||
    (single && g("useIgnoreExactSpellId") === true && g("ignoreAuraSpellids") !== undefined);
  const onlyNativeFilter = nativeFilter && !otherChecks;
  const names = g("useName") === true && list(g("auranames")).length > 0;
  const spellIds = g("useExactSpellId") === true && list(g("auraspellids")).length > 0;
  const acceptsSecretAuras = onlyNativeFilter && !names && !spellIds && g("fetchTooltip") !== true;
  return !acceptsSecretAuras;
}

/** The first `secretAura` trigger: the aura is drawn by the native aura display (AuraDisplay.GetTrigger). */
export function secretTrigger(aura: AuraDocument): TriggerInfo | undefined {
  return auraTriggers(aura).find((t) => t.kind === "secretAura");
}

/**
 * FrozenMarker.lua:15-28 CanFreeze: groups, empty regions and auras with an Aura (Modern) or Cooldown
 * Manager trigger never freeze; otherwise any aura2 trigger that freezes makes the aura freeze.
 */
export function canFreeze(aura: AuraDocument): boolean {
  if (aura.controlledChildren !== undefined || aura.regionType === "empty" || secretTrigger(aura)) return false;
  const triggers = auraTriggers(aura);
  if (triggers.some((t) => getField(t.trigger, "type") === "cdm")) return false;
  return triggers.some((t) => t.kind === "aura2" && aura2Freezes(t.trigger));
}

/** FrozenMarker.lua:41-63 UpdateFrozenMarker: the padlock shows while restricted unless hideFrozenMarker. */
export function frozenMarkerShown(aura: AuraDocument, inCombat: boolean): boolean {
  return inCombat && aura.hideFrozenMarker !== true && canFreeze(aura);
}

/** FrozenMarker.lua:52-55: 14 on a big aura, down to 8 on a small one; TOPRIGHT offset (2, 2) (:33). */
export function frozenMarkerSize(width: number, height: number): number {
  return Math.min(14, Math.max(8, 0.4 * Math.min(width, height)));
}

/**
 * The spell cooldown trigger keeps working in combat: SecretSpellCooldown.lua (header) reads readiness
 * when the timing is secret, and its `onCooldown` condition has a `conditionSecretSelect`
 * (Prototypes.lua:4707-4722), as does "Desaturate while on cooldown" (Prototypes.lua:4581-4587).
 */
export const SPELL_COOLDOWN_WORKS_IN_COMBAT = true;

// ---------------------------------------------------------------------------------------------
// Aura (Modern) native conditions
// ---------------------------------------------------------------------------------------------

/** Text kinds of the native display (SecretAuraAppearance.lua:20,193 TextKind). */
export type TextKind = "duration" | "stack" | "name" | "literal" | undefined;

export function textKind(text: LuaValue | undefined): TextKind {
  if (text === undefined || text === "") return "literal";
  const s = String(text);
  if (s === "%p") return "duration";
  if (s === "%s") return "stack";
  if (s === "%n") return "name";
  return s.replaceAll("%%", "").includes("%") ? undefined : "literal";
}

type Family = "duration" | "stack" | "plain" | "select" | "missing";

export interface NativeVariable {
  family: Family;
  /** Divides the threshold (percent variables). */
  divisor: number;
  operators?: string[];
  /** Glow rule (SecretAuraConditions.lua:507-516, validated at :960-968). */
  glow?: { operator?: string };
  /** Which properties the variable may drive. */
  allows: (aura: AuraDocument, path: string) => boolean;
}

const TIME_OPERATORS = ["<", ">="]; // SecretAuraConditions.lua:397
const KIND_OPERATORS = ["==", "~="]; // :398
const STACK_OPERATORS = ["<", ">=", ">", "<=", "==", "~="]; // :399

/** SecretAuraConditions.lua:154-161 highlight properties. */
export const HIGHLIGHT_PROPERTIES = new Set([
  "faAuraHighlightColor",
  "faAuraHighlightStyle",
  "faAuraHighlightPulse",
  "faAuraHighlightSize",
  "faAuraHighlightTexture",
]);

export function parseSubPath(path: string): { position: number; key: string } | undefined {
  const m = /^sub\.(\d+)\.(.+)$/.exec(path);
  return m ? { position: Number(m[1]), key: m[2] } : undefined;
}

export function subRegion(aura: AuraDocument, position: number): LuaTable | undefined {
  const element = field(aura.subRegions, position);
  return isLuaTable(element) ? element : undefined;
}

/** Detached elements (SecretAuraAppearance.lua IsDetachedElement) are not modelled: everything is attached. */
const detached = () => false;

/** SecretAuraConditions.lua:353-383 TextTarget: the text a property drives, and the channel. */
function textTarget(aura: AuraDocument, path: string, wanted: TextKind): { target: string; channel: string } | undefined {
  const sub = parseSubPath(path);
  if (!sub) {
    const channel = path === "color" ? "color" : path === "displayText" ? "text" : undefined;
    if (channel && aura.regionType === "text" && textKind(aura.displayText) === wanted) return { target: "color", channel };
    return undefined;
  }
  const channel = { text_color: "color", text_visible: "visible", text_text: "text" }[sub.key];
  const element = channel ? subRegion(aura, sub.position) : undefined;
  if (element && getField(element, "type") === "subtext" && !detached() && textKind(getField(element, "text_text")) === wanted) {
    return { target: `sub.${sub.position}.text_color`, channel: channel! };
  }
  return undefined;
}

/** SecretAuraConditions.lua:342-348 IsGlowProperty: sub.N.glow on an attached subglow. */
export function isGlowProperty(aura: AuraDocument, path: string): boolean {
  const sub = parseSubPath(path);
  if (!sub || sub.key !== "glow") return false;
  return getField(subRegion(aura, sub.position) ?? {}, "type") === "subglow";
}

/** SecretAuraConditions.lua:258-263, 272-275: properties a Missing condition may drive per region type. */
export const MISSING_ROOT: Record<string, string[]> = {
  icon: ["desaturate", "color", "zoom"],
  aurabar: ["barColor", "backgroundColor", "icon_color", "desaturate"],
  progresstexture: ["foregroundColor", "backgroundColor", "desaturateForeground"],
  text: ["color"],
};
/** SecretAuraConditions.lua:304-316: element keys a Missing condition may drive. */
const MISSING_ELEMENT: Record<string, string[]> = { subtext: ["text_color", "text_visible"], subglow: ["glow"] };

const allowsTimeText = (a: AuraDocument, p: string) => {
  const t = textTarget(a, p, "duration");
  return t !== undefined && t.channel !== "text"; // :401-404
};
const allowsGlowOrTimeText = (a: AuraDocument, p: string) => isGlowProperty(a, p) || allowsTimeText(a, p); // :406
const allowsStackText = (a: AuraDocument, p: string) => textTarget(a, p, "stack") !== undefined; // :410
const allowsHighlight = (_: AuraDocument, p: string) => HIGHLIGHT_PROPERTIES.has(p); // :414
const allowsGlowOrHighlight = (a: AuraDocument, p: string) => isGlowProperty(a, p) || HIGHLIGHT_PROPERTIES.has(p); // :418
/** :422-433 AllowsMissing. */
function allowsMissing(aura: AuraDocument, path: string): boolean {
  const roots = MISSING_ROOT[String(aura.regionType)];
  if (!roots) return false;
  if (HIGHLIGHT_PROPERTIES.has(path) || roots.includes(path)) return true;
  const sub = parseSubPath(path);
  if (!sub) return false;
  const element = subRegion(aura, sub.position);
  if (!element) return false;
  return (MISSING_ELEMENT[String(getField(element, "type"))] ?? []).includes(sub.key);
}

const duration = (extra: Partial<NativeVariable> = {}): NativeVariable => ({
  family: "duration",
  divisor: 1,
  operators: TIME_OPERATORS,
  allows: allowsTimeText,
  ...extra,
});
const plain = (extra: Partial<NativeVariable> = {}): NativeVariable => ({ family: "plain", divisor: 1, allows: allowsHighlight, ...extra });

/** SecretAuraConditions.lua:489-559 VARIABLES. */
export const NATIVE_VARIABLES: Record<string, NativeVariable> = {
  faAuraRemaining: duration({ allows: allowsGlowOrTimeText, glow: { operator: "<" } }),
  faAuraRemainingPercent: duration({ divisor: 100 }),
  faAuraElapsed: duration({ allows: allowsGlowOrTimeText, glow: { operator: "<" } }),
  faAuraElapsedPercent: duration({ divisor: 100 }),
  faAuraTotal: duration(),
  faAuraStart: duration(),
  faAuraEnd: duration(),
  faAuraApplications: { family: "stack", divisor: 1, operators: STACK_OPERATORS, allows: allowsStackText },
  faAuraPandemic: plain({ allows: allowsGlowOrHighlight, glow: {} }),
  faAuraStealable: plain(),
  faAuraNotStealable: plain(),
  faAuraPresent: plain(),
  faAuraType: { family: "select", divisor: 1, operators: KIND_OPERATORS, allows: allowsHighlight },
  faAuraDispel: { family: "select", divisor: 1, operators: KIND_OPERATORS, allows: allowsHighlight },
  faAuraMissing: { family: "missing", divisor: 1, allows: allowsMissing },
};

/** SecretAuraConditions.lua:576-583 NativeConditionKind: a VARIABLES check on a secretAura trigger. */
export function nativeVariable(aura: AuraDocument, check: LuaValue | undefined): string | undefined {
  if (!isLuaTable(check)) return undefined;
  const index = getField(check, "trigger");
  const variable = getField(check, "variable");
  if (typeof index !== "number" || typeof variable !== "string") return undefined;
  const trigger = field(field(aura.triggers, index), "trigger");
  if (field(trigger, "type") !== "secretAura") return undefined;
  return NATIVE_VARIABLES[variable] ? variable : undefined;
}

/** SecretAuraConditions.lua:585-593 ContainsNativeCondition (any nested check). */
export function containsNativeCondition(aura: AuraDocument, check: LuaValue | undefined): boolean {
  if (!isLuaTable(check)) return false;
  if (nativeVariable(aura, check)) return true;
  return list(getField(check, "checks")).some((c) => containsNativeCondition(aura, c));
}

/** SecretAuraConditions.lua:604-608 NativeConditionAllowsProperty. */
export function nativeAllowsProperty(aura: AuraDocument, check: LuaValue | undefined, path: string): boolean {
  const name = nativeVariable(aura, check);
  if (!name) return !HIGHLIGHT_PROPERTIES.has(path);
  return NATIVE_VARIABLES[name].allows(aura, path);
}

const MESSAGES = {
  grouping: "Aura (Modern) conditions cannot be combined with AND, OR or Else If.",
  timeOperator: "In Aura (Modern) conditions, time checks only accept < (less than) and >= (at least).",
  typeOperator: "In Aura (Modern) conditions, kind and dispel checks only accept == (is) and ~= (is not).",
  missingRegion: "Aura Missing works on Icon, Bar, Progress Texture and Text displays.",
  missingShowOn: "Aura Missing needs the trigger's Show On set to Aura(s) Missing or Always.",
  glow: "To light a glow from a time check, compare with < and set the glow to on.",
  timeBasis: "A countdown text follows one time basis only: seconds left, share left, elapsed, total, start or end.",
  property: "Choose a supported property for this Aura (Modern) condition.",
  foreignTrigger:
    "This check reads a trigger whose values conditions cannot use. Point it at another trigger or at a global variable.",
};

/**
 * SecretAuraConditions.lua:1036-1050 ValidateConditions: the first problem of the aura's conditions, or
 * undefined. While there is one, the aura's generic conditions don't run at all (Conditions.lua:760).
 * Header validators :924-940, change validators :958-984, CheckUsable :986-1000. The late-glow conflict
 * check (:966-967) is left out.
 */
export function validateSecretConditions(aura: AuraDocument): { condition: number; message: string } | undefined {
  const conditions = list(aura.conditions);
  const bases = new Map<string, string>();
  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    if (!isLuaTable(condition)) continue;
    const check = getField(condition, "check");
    let found: string | undefined;
    if (containsNativeCondition(aura, check)) {
      const name = nativeVariable(aura, check);
      const variable = name ? NATIVE_VARIABLES[name] : undefined;
      const following = conditions[i + 1];
      const op = field(check, "op");
      if (!variable || getField(condition, "linked") === true || field(following, "linked") === true) found = MESSAGES.grouping;
      else if (variable.operators && op !== undefined && !variable.operators.includes(String(op))) {
        found = variable.family === "duration" ? MESSAGES.timeOperator : variable.family === "select" ? MESSAGES.typeOperator : undefined;
      } else if (variable.family === "missing") {
        const showOn = secretShowOn(secretTrigger(aura)?.trigger ?? {});
        if (!MISSING_ROOT[String(aura.regionType)]) found = MESSAGES.missingRegion;
        else if (showOn !== "showOnMissing" && showOn !== "showAlways") found = MESSAGES.missingShowOn;
      }
      for (const change of list(getField(condition, "changes"))) {
        if (found || !variable) break;
        const property = field(change, "property");
        if (typeof property !== "string") continue;
        const value = field(change, "value");
        if (variable.glow && isGlowProperty(aura, property)) {
          if ((variable.glow.operator !== undefined && op !== variable.glow.operator) || value !== true) {
            found = MESSAGES.glow;
            break;
          }
        }
        if (variable.family === "duration") {
          const target = textTarget(aura, property, "duration");
          if (target) {
            const seen = bases.get(target.target);
            if (seen && seen !== name) {
              found = MESSAGES.timeBasis;
              break;
            }
            bases.set(target.target, name!);
          }
        }
        if (!nativeAllowsProperty(aura, check, property)) found = MESSAGES.property;
      }
    }
    if (!found && !checkUsable(aura, check)) found = MESSAGES.foreignTrigger;
    if (found) return { condition: i + 1, message: found };
  }
  return undefined;
}

function checkUsable(aura: AuraDocument, check: LuaValue | undefined): boolean {
  const name = field(check, "variable");
  if (name === undefined) return true;
  if (name === "AND" || name === "OR") return list(field(check, "checks")).every((c) => checkUsable(aura, c));
  const slot = field(check, "trigger");
  if (slot === -1) return true;
  const trigger = field(field(aura.triggers, slot as number), "trigger");
  if (!isLuaTable(trigger)) return false;
  return getField(trigger, "type") !== "secretAura" || NATIVE_VARIABLES[String(name)] !== undefined;
}

/** SecretAuraConditions.lua:247-268 ROOT_PROPERTIES and :304-316 ELEMENT_PROPERTIES (PropertyType). */
const NATIVE_ROOT: Record<string, string[]> = {
  icon: ["color", "desaturate", "inverse", "cooldownSwipe", "cooldownEdge", "cooldownTextDisabled", "zoom"],
  aurabar: ["barColor", "backgroundColor", "icon_color", "desaturate"],
  text: ["color", "fontSize", "displayText"],
  progresstexture: ["foregroundColor", "backgroundColor", "desaturateForeground"],
};
const NATIVE_ELEMENT: Record<string, string[]> = {
  subtext: ["text_color", "text_visible", "text_text", "text_fontSize", "text_anchorXOffset", "text_anchorYOffset", "text_alpha"],
  subglow: ["glow"],
};

/**
 * Conditions.lua:842-844: on an Aura (Modern) display, a generic condition's change to one of these
 * properties goes through SetConditionProperty, whose ApplyProperty returns early while restricted
 * (SecretAuraConditions.lua:1086-1087 `if not native.preview and WeakAuras.IsRestricted() then return end`).
 * So in combat such properties keep their last out-of-combat value.
 */
export function isNativeConditionProperty(aura: AuraDocument, path: string): boolean {
  const sub = parseSubPath(path);
  if (!sub) return (NATIVE_ROOT[String(aura.regionType)] ?? []).includes(path);
  const element = subRegion(aura, sub.position);
  return element !== undefined && (NATIVE_ELEMENT[String(getField(element, "type"))] ?? []).includes(sub.key);
}

/**
 * Generic condition checks that read an aura2 trigger's state follow that trigger: frozen triggers give
 * frozen values (BuffTrigger2.lua:2055: while restricted, aura updates are only queued for a rescan).
 * Conditions on non-native displays are otherwise applied normally in combat.
 */
export const GENERIC_CONDITIONS_RUN_IN_COMBAT = true;

/** Pandemic window: 30% of the aura's full duration (SecretAuraConditions.lua:20 PANDEMIC_PREVIEW_SHARE). */
export const PANDEMIC_SHARE = 0.3;
