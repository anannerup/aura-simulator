/**
 * The parts of an aura that are its own Lua, which the simulator doesn't run (the preview runs no custom code), each
 * with where it is in the options. The list is the addon's own: WeakAurasOptions' import "scam check"
 * (OptionsFrames/Update.lua scamCheck, the "This aura contains custom Lua code" line of the import dialog), place for
 * place and with its gates, grouped per place (a custom trigger lists its functions). Its places: custom triggers
 * (trigger, custom variables, untrigger, duration/name/icon/texture/stacks/overlay functions), custom trigger logic,
 * custom text, a custom anchor, the On Init/On Load/On Unload/On Show/On Hide custom actions and their chat custom
 * text, custom animation functions, a dynamic group's custom grow/sort/anchor-per-unit, and the conditions' custom
 * checks, "Run Custom Code" and chat custom text. Custom text also counts when a text uses %c (SubText.lua compiles
 * customText only then; a %c without a function still isn't evaluated here).
 * A custom trigger's state (TSU included) comes from the situation as for any trigger; a custom check never holds.
 * The keys are the same in both addons. Pure.
 */
import type { OptionPointer } from "../addon-vm/validation";
import { field, getField, isLuaTable, list, type AuraDocument, type LuaValue } from "../lua-value";
import { formatText } from "./text";

/** One place of an aura's custom Lua. */
export interface CustomLua {
  /** Short words, e.g. "trigger 2: custom (stateupdate)", "condition 1: custom check", "custom text (%c)". */
  where: string;
  /** The functions it has, when a place has several (a custom trigger's "trigger", "untrigger", "duration", …). */
  functions?: string[];
  pointer: OptionPointer;
}

/** Update.lua notEmptyString: code is counted when it has a non-space character. */
const isCode = (v: LuaValue | undefined): v is string => typeof v === "string" && /\S/.test(v);

const usesCustomText = (text: LuaValue | undefined) =>
  typeof text === "string" && formatText(text, () => undefined, { states: new Map(), name: "" }).some((p) => typeof p !== "string");

/** Update.lua checkTrigger: the functions of a custom trigger. */
function triggerFunctions(trigger: LuaValue, untrigger: LuaValue | undefined): string[] {
  const fns = isCode(field(trigger, "custom")) ? ["trigger"] : [];
  if (field(trigger, "custom_type") === "stateupdate") {
    if (isCode(field(trigger, "customVariables"))) fns.push("custom variables");
    return fns;
  }
  const optional: [LuaValue | undefined, string][] = [
    [field(untrigger, "custom"), "untrigger"],
    [field(trigger, "customDuration"), "duration"],
    [field(trigger, "customName"), "name"],
    [field(trigger, "customIcon"), "icon"],
    [field(trigger, "customTexture"), "texture"],
    [field(trigger, "customStacks"), "stacks"],
    ...[1, 2, 3, 4, 5, 6, 7].map((i): [LuaValue | undefined, string] => [field(trigger, `customOverlay${i}`), `overlay ${i}`]),
  ];
  for (const [code, label] of optional) if (isCode(code)) fns.push(label);
  return fns;
}

/** Update.lua's condition checks: a custom check (`trigger == -1`, `customcheck`) at any depth of linked checks. */
function hasCustomCheck(check: LuaValue | undefined): boolean {
  if (!isLuaTable(check)) return false;
  if (getField(check, "trigger") === -1 && getField(check, "variable") === "customcheck" && isCode(getField(check, "value"))) return true;
  return list(getField(check, "checks")).some(hasCustomCheck);
}

const ACTIONS: { key: string; label: string; code: string; flag: string }[] = [
  { key: "init", label: "On Init", code: "custom", flag: "do_custom" },
  { key: "init", label: "On Load", code: "customOnLoad", flag: "do_custom_load" },
  { key: "init", label: "On Unload", code: "customOnUnload", flag: "do_custom_unload" },
  { key: "start", label: "On Show", code: "custom", flag: "do_custom" },
  { key: "finish", label: "On Hide", code: "custom", flag: "do_custom" },
];
const MESSAGES: { key: string; label: string }[] = [
  { key: "start", label: "On Show" },
  { key: "finish", label: "On Hide" },
];
const ANIMATED = ["alpha", "translate", "scale", "rotate", "color"];

/** Every place of `aura`'s custom Lua (empty when it has none). A group's children are their own auras. */
export function customLua(aura: AuraDocument): CustomLua[] {
  const parts: CustomLua[] = [];
  const triggers = aura.triggers;
  list(triggers).forEach((t, i) => {
    const n = i + 1;
    const trigger = field(t, "trigger");
    if (!isLuaTable(trigger) || getField(trigger, "type") !== "custom") return;
    const functions = triggerFunctions(trigger, field(t, "untrigger"));
    if (!functions.length) return;
    parts.push({
      where: `trigger ${n}: custom (${String(getField(trigger, "custom_type") ?? "status")})`,
      functions,
      pointer: { tab: "trigger", trigger: n, path: ["triggers", n, "trigger"], label: `Trigger ${n}` },
    });
  });
  if (field(triggers, "disjunctive") === "custom" && isCode(field(triggers, "customTriggerLogic"))) {
    parts.push({
      where: "custom trigger logic",
      pointer: { tab: "trigger", trigger: 1, path: ["triggers", "customTriggerLogic"], label: "Triggers (custom trigger combination)" },
    });
  }

  list(aura.conditions).forEach((condition, i) => {
    if (!isLuaTable(condition)) return;
    const n = i + 1;
    if (hasCustomCheck(getField(condition, "check"))) {
      parts.push({ where: `condition ${n}: custom check`, pointer: { tab: "conditions", condition: n, path: ["conditions", n, "check"], label: `Condition ${n}` } });
    }
    list(getField(condition, "changes")).forEach((change, j) => {
      const property = field(change, "property");
      if (!isCode(field(field(change, "value"), "custom"))) return;
      const what = property === "customcode" ? "Run Custom Code" : property === "chat" ? "chat message: custom text" : undefined;
      if (!what) return;
      parts.push({
        where: `condition ${n}: ${what}`,
        pointer: {
          tab: "conditions",
          condition: n,
          change: j + 1,
          property: String(property),
          path: ["conditions", n, "changes", j + 1, "value", "custom"],
          label: `Condition ${n}, change ${j + 1} (${String(property)})`,
        },
      });
    });
  });

  const texts = [
    ...list(aura.subRegions).filter((e) => field(e, "type") === "subtext").map((e) => field(e, "text_text")),
    ...list(aura.conditions).flatMap((c) => list(field(c, "changes")).filter((ch) => /^sub\.\d+\.text_text$/.test(String(field(ch, "property")))).map((ch) => field(ch, "value"))),
    ...(aura.regionType === "text" ? [aura.displayText] : []),
  ];
  if (isCode(aura.customText) || texts.some(usesCustomText)) {
    parts.push({ where: "custom text (%c)", pointer: { tab: "region", property: "customText", path: ["customText"], label: "Display (custom text function)" } });
  }
  if (aura.anchorFrameType === "CUSTOM" && isCode(aura.customAnchor)) {
    parts.push({ where: "custom anchor", pointer: { tab: "region", property: "customAnchor", path: ["customAnchor"], label: "Display (custom anchor)" } });
  }

  for (const { key, label, code, flag } of ACTIONS) {
    const action = field(aura.actions, key);
    if (field(action, flag) === true && isCode(field(action, code))) {
      parts.push({ where: `${label} custom code`, pointer: { tab: "action", path: ["actions", key, code], label: `Actions (${label})` } });
    }
  }
  for (const { key, label } of MESSAGES) {
    const action = field(aura.actions, key);
    if (field(action, "do_message") === true && isCode(field(action, "message_custom"))) {
      parts.push({
        where: `${label} chat message: custom text`,
        pointer: { tab: "action", path: ["actions", key, "message_custom"], label: `Actions (${label} chat message)` },
      });
    }
  }

  for (const phase of ["start", "main", "finish"]) {
    const anim = field(aura.animation, phase);
    if (field(anim, "type") !== "custom") continue;
    const functions = ANIMATED.filter((k) => field(anim, `use_${k}`) === true && field(anim, `${k}Type`) === "custom" && isCode(field(anim, `${k}Func`)));
    if (functions.length) {
      parts.push({
        where: `${phase} animation: custom function`,
        functions,
        pointer: { tab: "animation", path: ["animation", phase], label: `Animations (${phase})` },
      });
    }
  }

  if (aura.regionType === "dynamicgroup") {
    const group: [boolean, string, string][] = [
      [aura.grow === "CUSTOM", "customGrow", "custom grow"],
      [aura.sort === "custom", "customSort", "custom sort"],
      [aura.grow !== "CUSTOM" && aura.useAnchorPerUnit === true && aura.anchorPerUnit === "CUSTOM", "customAnchorPerUnit", "custom anchor per unit"],
    ];
    for (const [used, key, where] of group) {
      if (used && isCode(aura[key])) parts.push({ where, pointer: { tab: "region", property: key, path: [key], label: `Display (${where})` } });
    }
  }

  return parts;
}

/** What of `aura` is custom code the simulator didn't run, in words (empty when nothing). */
export function customCodeParts(aura: AuraDocument): string[] {
  return customLua(aura).map((p) => p.where);
}
