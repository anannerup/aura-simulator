import type { LuaKey } from "../lua-value";
import { plainText } from "../wow-text";

/** The part of the in-game options that causes a message: `tab` is the options window's tab key (`OptionTab.key`). Indexes are 1-based, as in the game. */
export type OptionTarget =
  | { tab: "trigger"; trigger: number }
  | { tab: "conditions"; condition?: number; change?: number; property?: string }
  | { tab: "region"; property?: string }
  | { tab: "action" }
  | { tab: "animation" };

export type OptionPointer = OptionTarget & {
  /** Path into the aura document, in Lua keys (use `getField` per step), e.g. ["conditions", 1, "changes", 2, "property"]. */
  path: LuaKey[];
  /** Plain words, e.g. "Condition 1, change 1 (desaturate)". */
  label: string;
};

export interface ValidationMessage {
  /**
   * Stable machine-readable kind:
   * - `modern.invalid`: the addon's Aura (Modern) validation fails (the aura won't work);
   * - `modern.status`: the trigger's status line says it won't work;
   * - `modern.notEligible`: an Aura (Modern) trigger that can't drive this display;
   * - `modern.note`: a caution from the trigger's status line;
   * - `combat.hiddenValues`: in combat the game hides values this trigger compares;
   * - `defaults.error`: the addon failed while filling defaults / migrating;
   * - `defaults.message`: a line the addon printed while filling defaults (an error when it says ERROR);
   * - `add.error`: the addon's WeakAuras.Add raised a Lua error for the aura, so it was not registered;
   * - `addon.<key>`: a warning the addon raised when the aura was added (e.g. `addon.forever_combat_log`);
   *   `addon.LuaError` when running the aura in the simulated client raised a Lua error.
   */
  code: string;
  severity: "error" | "warning" | "info";
  /** Plain words, from the addon where it has them. */
  message: string;
  pointer?: OptionPointer;
  /** For group states: the aura (id) the message is about. */
  auraId?: string;
}

export type CombatStatus = "ok" | "limited" | "broken";

export interface CombatReport {
  /** ok: fully usable in combat; limited: some features stop working in combat; broken: won't work. */
  status: CombatStatus;
  messages: string[];
}

/**
 * The addon's own validation of an aura. `errors` and `warnings` are the addon's messages in every game.
 * `combat` is the combat verdict, only in a game whose client restricts addons in combat (Forever: Musca Auras'
 * combat checks); on TBC there are no combat restrictions, so it is absent (never "ok" by default), and the
 * Forever-only codes (`modern.*`, `combat.*`) don't occur.
 */
export interface ValidationResult {
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  combat?: CombatReport;
}

/** What lua/extract.ts X.validate returns (JSON). */
export interface RawValidation {
  prepare: { ok: boolean; error?: string; handlerErrors?: string[]; prints?: string[] };
  regionType?: string;
  /** Musca Auras only (Aura (Modern), lua/extract-forever.ts); absent for other games. */
  hasModernTrigger?: boolean;
  eligible?: boolean;
  sourceTrigger?: number;
  problems?: {
    message: string;
    kind: "change" | "condition" | "conditions" | "actions" | "animation" | "display" | "trigger";
    trigger?: number;
    condition?: number;
    change?: number;
    property?: string;
    propertyAllowed?: boolean;
  }[];
  status?: string;
  statusError?: string;
  statusSegments?: string[];
  notEligible?: string;
  regionSupported?: boolean;
  combatTriggers?: {
    trigger: number;
    triggerType: string;
    secretSpell: boolean;
    scope?: string;
    message: string;
    casterOnly: boolean;
    casterMessage: string;
  }[];
  auraWarnings?: { key: string; severity: string; message: string }[];
  add?: { ok: boolean; error?: string; handlerErrors?: string[] };
}

/** How addon warnings raised on Add affect use in combat. Others don't change the combat status. */
const COMBAT_EFFECT_OF_ADDON_WARNING: Record<string, CombatStatus> = {
  forever_combat_log: "broken",
  forever_secret_threshold: "limited",
  protected_frame: "limited",
};

const RANK: Record<CombatStatus, number> = { ok: 0, limited: 1, broken: 2 };
const worseStatus = (a: CombatStatus, b: CombatStatus): CombatStatus => (RANK[b] > RANK[a] ? b : a);

function triggerPointer(trigger: number | undefined): OptionPointer | undefined {
  if (!trigger) return undefined;
  return { tab: "trigger", trigger, path: ["triggers", trigger, "trigger"], label: `Trigger ${trigger}` };
}

type Problem = NonNullable<RawValidation["problems"]>[number];

function problemPointer(p: Problem, sourceTrigger: number | undefined): OptionPointer | undefined {
  switch (p.kind) {
    case "change":
      return {
        tab: "conditions",
        condition: p.condition,
        change: p.change,
        property: p.property,
        path: ["conditions", p.condition!, "changes", p.change!, "property"],
        label: `Condition ${p.condition}, change ${p.change}${p.property ? ` (${p.property})` : ""}`,
      };
    case "condition":
      return { tab: "conditions", condition: p.condition, path: ["conditions", p.condition!], label: `Condition ${p.condition}` };
    case "conditions":
      return { tab: "conditions", path: ["conditions"], label: "Conditions" };
    case "actions":
      return { tab: "action", path: ["actions"], label: "Actions" };
    case "animation":
      return { tab: "animation", path: ["animation"], label: "Animations" };
    case "display":
      return p.property
        ? { tab: "region", property: p.property, path: [p.property], label: `Display (${p.property})` }
        : { tab: "region", path: [], label: "Display" };
    case "trigger":
      return triggerPointer(p.trigger ?? sourceTrigger);
  }
}

function addonSeverity(severity: string): ValidationMessage["severity"] {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "info";
}

const WONT_WORK = /^Won't work:\s*/;
const OK_MESSAGE = "Fully usable in combat: no combat restrictions found.";

/**
 * Turns the VM's raw validation of one aura into plain messages with pointers and, with `combatCheck` (the game
 * restricts addons in combat), a combat status.
 */
export function interpretValidation(raw: RawValidation, options: { auraId?: string; combatCheck: boolean }): ValidationResult {
  const result = interpretOne(raw, options.auraId);
  return options.combatCheck ? result : { errors: result.errors, warnings: result.warnings };
}

function interpretOne(raw: RawValidation, auraId: string | undefined): Required<ValidationResult> {
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  const combatMessages: string[] = [];
  let status: CombatStatus = "ok";
  const tag = <T extends ValidationMessage>(m: T): T => (auraId === undefined ? m : { ...m, auraId });

  for (const e of [...(raw.prepare.handlerErrors ?? []), ...(raw.prepare.error ? [raw.prepare.error] : [])]) {
    errors.push(tag({ code: "defaults.error", severity: "error", message: `The addon failed while filling defaults: ${e}` }));
  }
  if (raw.add && !raw.add.ok) {
    const detail = raw.add.error?.split("\n")[0];
    errors.push(
      tag({
        code: "add.error",
        severity: "error",
        message:
          "Adding this aura in the simulated client raised a Lua error" +
          (detail ? ` (${detail})` : "") +
          ", so the addon did not register it. If the aura has custom code, check it; otherwise the simulator lacks something the game has.",
      }),
    );
  }
  for (const line of raw.prepare.prints ?? []) {
    const isError = /ERROR/.test(line);
    (isError ? errors : warnings).push(
      tag({ code: "defaults.message", severity: isError ? "error" : "info", message: plainText(line) }),
    );
  }

  if (raw.eligible) {
    for (const p of raw.problems ?? []) {
      errors.push(tag({ code: "modern.invalid", severity: "error", message: p.message, pointer: problemPointer(p, raw.sourceTrigger) }));
    }
    const statusLine = raw.status ?? (raw.statusError ? `Won't work: ${raw.statusError}` : undefined);
    if (statusLine && WONT_WORK.test(statusLine)) {
      status = "broken";
      if (!raw.problems?.length) {
        errors.push(
          tag({
            code: "modern.status",
            severity: "error",
            message: statusLine.replace(WONT_WORK, ""),
            pointer: triggerPointer(raw.sourceTrigger),
          }),
        );
      }
      combatMessages.push(statusLine);
    } else if (statusLine) {
      const [headline, ...notes] = raw.statusSegments?.length ? raw.statusSegments : [statusLine];
      combatMessages.push(headline.trim());
      for (const note of notes) {
        warnings.push(tag({ code: "modern.note", severity: "info", message: note.trim(), pointer: triggerPointer(raw.sourceTrigger) }));
        combatMessages.push(note.trim());
      }
    }
    if (raw.problems?.length) status = "broken";
  } else if (raw.notEligible) {
    status = "broken";
    const pointer: OptionPointer = raw.regionSupported
      ? { tab: "region", property: "progressSource", path: ["progressSource"], label: "Display (progress source)" }
      : { tab: "region", property: "regionType", path: ["regionType"], label: "Display type" };
    errors.push(tag({ code: "modern.notEligible", severity: "error", message: raw.notEligible, pointer }));
    combatMessages.push(`Won't work: ${raw.notEligible}`);
  }

  for (const t of raw.combatTriggers ?? []) {
    const message = t.casterOnly ? t.casterMessage : t.message;
    const detail = t.secretSpell ? "Exact spell ID lookups" : t.scope?.replace(/:\s*$/, "");
    warnings.push(
      tag({
        code: "combat.hiddenValues",
        severity: "warning",
        message: detail ? `${message} (${detail}.)` : message,
        pointer: triggerPointer(t.trigger),
      }),
    );
    combatMessages.push(`Trigger ${t.trigger}: ${message}`);
    status = worseStatus(status, t.casterOnly ? "broken" : "limited");
  }

  for (const w of raw.auraWarnings ?? []) {
    // The addon repeats its validation message as an aura warning; it is reported above already.
    if (errors.some((e) => e.message === w.message)) continue;
    if (w.key === "LuaError") {
      const detail = raw.add?.handlerErrors?.[0]?.split("\n").pop();
      warnings.push(
        tag({
          code: "addon.LuaError",
          severity: "warning",
          message:
            "Running this aura in the simulated client raised a Lua error" +
            (detail ? ` (${detail})` : "") +
            ". If the aura has custom code, check it; otherwise the simulator lacks something the game has.",
        }),
      );
      continue;
    }
    const severity = addonSeverity(w.severity);
    (severity === "error" ? errors : warnings).push(tag({ code: `addon.${w.key}`, severity, message: w.message }));
    const effect = COMBAT_EFFECT_OF_ADDON_WARNING[w.key];
    if (effect) {
      status = worseStatus(status, effect);
      combatMessages.push(w.message);
    }
  }

  if (combatMessages.length === 0) {
    combatMessages.push(status === "ok" ? OK_MESSAGE : "");
  }
  return { errors, warnings, combat: { status, messages: combatMessages.filter(Boolean) } };
}

/**
 * Combines per-aura results (a group and its children; `ids` names each aura) into one. They come from one game, so
 * either all have a combat verdict or none has.
 */
export function mergeValidation(results: ValidationResult[], ids: (string | undefined)[] = []): ValidationResult {
  if (results.length === 1) return results[0];
  const merged: ValidationResult = {
    errors: results.flatMap((r) => r.errors),
    warnings: results.flatMap((r) => r.warnings),
  };
  const combats = results.map((r) => r.combat);
  if (!combats.every((c) => c !== undefined)) return merged;
  let status: CombatStatus = "ok";
  for (const c of combats) status = worseStatus(status, c.status);
  const messages = combats.flatMap((c, i) => (c.status === "ok" ? [] : c.messages.map((m) => (ids[i] ? `${ids[i]}: ${m}` : m))));
  return { ...merged, combat: { status, messages: messages.length ? messages : [OK_MESSAGE] } };
}
