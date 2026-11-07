/**
 * The parts of an aura that are its own Lua, which the simulator doesn't run (the preview runs no custom code): custom
 * triggers (their state, TSU included, comes from the situation as for any trigger), custom condition checks (never
 * true here), "Run Custom Code" condition changes, custom text (%c), the On Init/On Show/On Hide custom actions and
 * custom animation functions. Where the addon runs them: GenericTrigger.lua (custom triggers), Conditions.lua:302
 * (customcheck) and :666 (customcode), WeakAuras.lua:942-975 (actions) and ReplacePlaceHolders (%c), Animations.lua
 * (custom functions). The keys are the same in both addons. Pure.
 */
import { entries, field, getField, isLuaTable, list, type AuraDocument, type LuaValue } from "../lua-value";
import { formatText } from "./text";

const hasCustomText = (text: LuaValue | undefined) =>
  typeof text === "string" && formatText(text, () => undefined, { states: new Map(), name: "" }).some((p) => typeof p !== "string");

function hasCustomCheck(check: LuaValue | undefined): boolean {
  if (!isLuaTable(check)) return false;
  if (getField(check, "variable") === "customcheck") return true;
  return list(getField(check, "checks")).some(hasCustomCheck);
}

const ACTIONS: [string, string][] = [
  ["init", "On Init"],
  ["start", "On Show"],
  ["finish", "On Hide"],
];
const ANIMATED = ["translate", "alpha", "scale", "rotate", "color"];

/** What of `aura` is custom code the simulator didn't run, in words (empty when nothing). */
export function customCodeParts(aura: AuraDocument): string[] {
  const parts: string[] = [];
  const triggers = aura.triggers;
  if (isLuaTable(triggers)) {
    const numbered = entries(triggers).filter(([k]) => typeof k === "number").sort(([a], [b]) => Number(a) - Number(b));
    for (const [n, t] of numbered) {
      const trigger = field(t, "trigger");
      if (isLuaTable(trigger) && getField(trigger, "type") === "custom") {
        parts.push(`trigger ${n}: custom (${String(getField(trigger, "custom_type") ?? "status")})`);
      }
    }
  }
  list(aura.conditions).forEach((condition, i) => {
    if (!isLuaTable(condition)) return;
    if (hasCustomCheck(getField(condition, "check"))) parts.push(`condition ${i + 1}: custom check`);
    if (list(getField(condition, "changes")).some((c) => field(c, "property") === "customcode")) parts.push(`condition ${i + 1}: Run Custom Code`);
  });
  const texts = [
    ...list(aura.subRegions).filter((e) => field(e, "type") === "subtext").map((e) => field(e, "text_text")),
    ...list(aura.conditions).flatMap((c) => list(field(c, "changes")).filter((ch) => /^sub\.\d+\.text_text$/.test(String(field(ch, "property")))).map((ch) => field(ch, "value"))),
    ...(aura.regionType === "text" ? [aura.displayText] : []),
  ];
  if (texts.some(hasCustomText)) parts.push("custom text (%c)");
  for (const [key, label] of ACTIONS) {
    const action = field(aura.actions, key);
    if (field(action, "do_custom") === true && typeof field(action, "custom") === "string") parts.push(`${label} custom code`);
  }
  for (const phase of ["start", "main", "finish"]) {
    const anim = field(aura.animation, phase);
    if (field(anim, "type") !== "custom") continue;
    if (ANIMATED.some((k) => field(anim, `use_${k}`) === true && field(anim, `${k}Type`) === "custom")) parts.push(`${phase} animation: custom function`);
  }
  return parts;
}
