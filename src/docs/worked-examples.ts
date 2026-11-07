/**
 * The agent docs' worked examples: the four v1 acceptance auras and one counter-example, each a complete push body with
 * the combat status the docs promise. The documents live in `src/render/examples.ts`; tests push every example and
 * check the promised status.
 */
import type { AuraDocument, CombatStatus } from "@/core";
import {
  buffMissing,
  buffUnderThreeMinutes,
  cooldownIcon,
  remainingDesaturates,
  targetDebuffBar,
  v1Group,
} from "@/render/examples";

export interface WorkedExample {
  /** Stable key; the docs tag the example's JSON block with it (```json example=<key> combat=<status>). */
  key: string;
  title: string;
  /** What the player asked for, in their words. */
  request: string;
  /** How the aura does it and why it holds in combat. Markdown, one paragraph per entry. */
  explanation: string[];
  /** The push body for POST /api/workspaces/<id>/aura. */
  body: { aura: AuraDocument; children?: AuraDocument[] };
  /** `validation.combat.status` of the push answer. */
  combat: CombatStatus;
}

export const WORKED_EXAMPLES: WorkedExample[] = [
  {
    key: "buff-under-3-min",
    title: "1a. Buff running low (Aura (Modern) icon, Remaining Time)",
    request: "My Arcane Intellect is about to expire: show it desaturated when less than 3 minutes are left, and make it glow as it expires.",
    explanation: [
      "Trigger 1 is Aura (Modern) (`secretAura`) on the player, Buff (`HELPFUL`), exact spell ID 1459, own casts only " +
        "(`nativeFilters.PLAYER`), Show On left at Aura(s) Found. The trigger's own Remaining Time option shows the icon " +
        'only under 3 minutes: `secretUseRem: true`, `secretRemOperator: "<"`, `secretRem: 180`. The game itself does the ' +
        "hiding, so it holds in combat. Remaining Time is for Icon displays.",
      "`desaturate: true` is a plain display setting: grey whenever shown, no condition needed (a time check may not " +
        "desaturate). Condition 1 (`faAuraRemaining < 30`) lights the glow, sub-element 2 (`sub.2.glow`), in the last 30 " +
        "seconds; condition 2 colours the `%p` time text (sub-element 1) red under 10 seconds. Both are changes Aura (Modern) " +
        "allows for a time check, and with Remaining Time, time conditions must compare seconds left like this.",
    ],
    body: { aura: buffUnderThreeMinutes },
    combat: "ok",
  },
  {
    key: "buff-missing",
    title: "1b. Buff missing (Aura (Modern), Show On Missing)",
    request: "Show the Arcane Intellect icon desaturated and glowing when the buff is missing.",
    explanation: [
      'Same trigger with `secretShowOn: "showOnMissing"`: the icon shows only while the buff is missing. Condition 1 checks ' +
        "`faAuraMissing` (no operator or value) and changes `desaturate` and the glow (`sub.1.glow`). Desaturate and colour are " +
        "allowed on the missing state, and only there.",
      "Push 1a and 1b as two auras: together they are the buff reminder.",
    ],
    body: { aura: buffMissing },
    combat: "ok",
  },
  {
    key: "cooldown-icon",
    title: "2. Cooldown icon that desaturates on cooldown",
    request: "Show Fire Blast's icon, greyed out while it is on cooldown.",
    explanation: [
      'Trigger 1 is the spell cooldown trigger: `type: "spell"`, `event: "Cooldown Progress (Spell)"`, `spellName` the spell ID ' +
        '(a number), `genericShowOn: "showAlways"` with `use_genericShowOn: true` so the icon stays visible when ready.',
      "Condition 1 checks `onCooldown` (a boolean: `value: 1`) and sets `desaturate`. This check keeps working in combat " +
        "(the addon reads readiness even when the game hides the cooldown's timing). Don't compare the cooldown's remaining " +
        "time (`expirationTime`) in a condition: that value is hidden in combat. The trigger option " +
        "`desaturateOnCooldown: true` does the same without a condition. The `%s` text shows charges.",
    ],
    body: { aura: cooldownIcon },
    combat: "ok",
  },
  {
    key: "target-debuff-bar",
    title: "3. Target debuff time-left bar",
    request: "Show a bar with the time left on my Corruption on the target.",
    explanation: [
      'An `aurabar` with an Aura (Modern) trigger on `unit: "target"`, Debuff (`HARMFUL`), spell ID 172, own casts only ' +
        "(`nativeFilters.PLAYER: true`). The game draws the bar natively, so it keeps running in combat.",
      "Sub-elements: 1 `subbackground` and 2 `subforeground` (every bar has them; they count in `sub.N`), 3 the name " +
        "(`%n`), 4 the time (`%p`). Condition 1 colours the time text red under 5 seconds (`sub.4.text_color`). Bars have no " +
        "Remaining Time window and no time-left glow; the `%p` colour works.",
    ],
    body: { aura: targetDebuffBar },
    combat: "ok",
  },
  {
    key: "v1-group",
    title: "4. A group holding these",
    request: "Put them together so I can import them in one go.",
    explanation: [
      'A `group` ("v1 auras") with 1a, 1b, 2 and 3 as children. The children keep their documents; each gets ' +
        '`parent: "v1 auras"` and an offset relative to the group\'s centre, and the group lists their ids in ' +
        "`controlledChildren`. Push it as one body: `aura` is the group, `children` its descendants. The combat status is " +
        "the worst of all members.",
    ],
    body: { aura: v1Group.aura, children: v1Group.children },
    combat: "ok",
  },
];

/** What not to do: a time check driving desaturate. The answer says `broken` and points at the change. */
export const COUNTER_EXAMPLE: WorkedExample = {
  key: "remaining-desaturates",
  title: "Counter-example: desaturate from seconds left",
  request: "Grey the icon out under 10 seconds left.",
  explanation: [
    "`faAuraRemaining` may only light a glow or change a `%p` text. The answer is `broken` with error `modern.invalid` " +
      '"Choose a supported property for this Aura (Modern) condition." pointing at "Condition 1, change 1 (desaturate)". ' +
      "Fix: glow instead, or colour the `%p` text.",
  ],
  body: { aura: remainingDesaturates },
  combat: "broken",
};

export const ALL_DOC_EXAMPLES: WorkedExample[] = [...WORKED_EXAMPLES, COUNTER_EXAMPLE];
