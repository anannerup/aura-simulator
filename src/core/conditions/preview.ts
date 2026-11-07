/**
 * What an aura shows in a situation, in words an agent can read without a browser: per display, shown or not, its
 * triggers, the active conditions and what they change, the glows. The push API answers with it (`preview`), so an
 * agent can check that an aura works (shown when the buff is missing, glowing under 30 seconds) over HTTP. It reads
 * the same evaluation the game screen draws (`auraRules(game).evaluate`). Pure.
 */
import type { AuraState } from "../aura-core";
import type { AddonGameId } from "../addon-vm/toc";
import type { ValidationResult } from "../addon-vm/validation";
import type { AuraDocument, LuaValue } from "../lua-value";
import { situationJson, type Situation } from "../situation";
import { documentProperties } from "./evaluate";
import { conditionProblem } from "./forever";
import { auraRules } from "./index";
import type { DrawnText } from "./text";

/** What a text draws, as the game screen draws it (the same evaluation). */
export interface TextPreview {
  /** The formatted string; custom text placeholders (%c) as their marker `[%c]`. */
  text: string;
  /** Set when the text has custom text (%c): the simulator doesn't run the aura's custom text function. */
  customText?: "not evaluated";
}

export interface DisplayPreview {
  id: string;
  regionType: string;
  /** The display is drawn. */
  shown: boolean;
  /** Each trigger: active or not, and the time left, duration and stacks it reports. */
  triggers: { trigger: number; active: boolean; remaining?: number; duration: number; stacks: number }[];
  /** 1-based numbers of the conditions whose check holds (conditions only run while the display is shown). */
  activeConditions: number[];
  /** What the active conditions changed: property (`desaturate`, `sub.2.glow`, …) → its value now. */
  changed: Record<string, LuaValue>;
  /** Glow sub-elements by their 1-based place in `subRegions`, and whether each is lit. */
  glows: { subRegion: number; lit: boolean }[];
  /** Each text sub-element by its 1-based place in `subRegions`: what it draws and whether it is visible. */
  texts: (TextPreview & { subRegion: number; visible: boolean })[];
  /** A text display's own text. */
  displayText?: TextPreview;
  /**
   * Present when the display has custom Lua, which the preview doesn't run: which parts ("trigger 2: custom
   * (stateupdate)", "condition 1: custom check", "custom text (%c)", "On Show custom code", …). A custom trigger's state
   * is the situation's, a custom check never holds; check those parts in game.
   */
  notEvaluated?: string[];
  /** Forever only, when true: the display is frozen in combat (the game screen's padlock). */
  frozen?: true;
  /** Forever only, when true: Aura (Modern)'s native "missing" button is what is drawn. */
  missing?: true;
  /** Forever only: properties that keep their pre-combat value in combat. */
  heldInCombat?: string[];
}

export interface SituationPreview {
  /** The whole situation evaluated, as `readSituation` reads it. */
  situation: Record<string, unknown>;
  /** Every display (not groups) of the aura, in the addon's order. */
  displays: DisplayPreview[];
}

const isGroup = (a: AuraDocument) => a.regionType === "group" || a.regionType === "dynamicgroup";
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const textPreview = (t: DrawnText): TextPreview => ({ text: t.text, ...(t.customText && { customText: "not evaluated" as const }) });

/**
 * Evaluates every display of `state` in `situation` by `game`'s rules. `validation` (the push's) gives Forever's
 * verdict on Aura (Modern) conditions, which decides whether they run at all; without it they run as written.
 */
export function previewSituation(state: AuraState, situation: Situation, game: AddonGameId, validation?: ValidationResult | null): SituationPreview {
  const rules = auraRules(game);
  const displays = [state.aura, ...state.children].filter((a) => !isGroup(a));
  return {
    situation: situationJson(situation),
    displays: displays.map((aura) => {
      const id = String(aura.id ?? "");
      const own = validation && {
        errors: validation.errors.filter((e) => e.auraId === undefined || e.auraId === id),
        warnings: [],
      };
      const r = rules.evaluate(aura, situation, conditionProblem(own ?? undefined));
      const before = documentProperties(aura);
      const changed: Record<string, LuaValue> = {};
      for (const [k, v] of Object.entries(r.properties)) if (!sameJson(before[k], v)) changed[k] = v;
      const preview: DisplayPreview = {
        id,
        regionType: String(aura.regionType ?? ""),
        shown: r.shown,
        triggers: r.triggers.map((t) => ({
          trigger: t.index,
          active: t.active,
          ...(t.remaining !== undefined && { remaining: Math.round(t.remaining * 10) / 10 }),
          duration: t.duration,
          stacks: t.stacks,
        })),
        activeConditions: r.activeConditions,
        changed,
        glows: r.glows.map((g) => ({ subRegion: g.index, lit: g.visible })),
        texts: Object.entries(r.texts).map(([position, t]) => {
          const { text, ...custom } = textPreview(t);
          return { subRegion: Number(position), text, visible: t.visible, ...custom };
        }),
      };
      if (r.displayText) preview.displayText = textPreview(r.displayText);
      if (r.customCode.length) preview.notEvaluated = r.customCode;
      if (r.frozenMarker) preview.frozen = true;
      if (r.missing) preview.missing = true;
      if (r.heldInCombat.length) preview.heldInCombat = r.heldInCombat;
      return preview;
    }),
  };
}
