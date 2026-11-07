/**
 * TBC's worked examples: the TBC v1 auras (`../examples.ts`), each shown as wago JSON with a situation that shows it
 * working. Per game: Forever's (`src/games/forever/docs/worked-examples.ts`) promise a combat status, which TBC has
 * none of. Tests push every example block of the served docs and check that the addon finds no problems.
 */
import { canonicalize, toWagoJson, type AuraDocument } from "@/core";
import { tbcBuffMissing, tbcBuffUnderThreeMinutes, tbcCooldownIcon, tbcTargetDebuffBar, tbcV1Group } from "../examples";

export interface TbcWorkedExample {
  /** Stable key; the docs tag the example's wago JSON block with it (```json example=<key>). */
  key: string;
  title: string;
  /** What the player asked for, in their words. */
  request: string;
  /** How the aura does it. Markdown, one paragraph per entry. */
  explanation: string[];
  body: { aura: Record<string, unknown>; children?: Record<string, unknown>[] };
  /** A situation to set after pushing it, and what `preview` then says. */
  check: { situation: unknown; shows: string };
}

export const TBC_WORKED_EXAMPLES: TbcWorkedExample[] = [
  {
    key: "buff-under-3-min",
    title: "1a. Buff running low",
    request: "My Arcane Intellect is about to expire: show it desaturated when less than 3 minutes are left, and make it glow as it expires.",
    explanation: [
      'Trigger 1 is the Aura trigger (`aura2`) on the player, Buff (`HELPFUL`), by name (`useName` + `auranames`: every rank ' +
        "of Arcane Intellect and Arcane Brilliance; `useExactSpellId` + `auraspellids` would match exact IDs instead). Its own " +
        'Remaining Time option shows the icon only under 3 minutes: `useRem: true`, `remOperator: "<"`, `rem: "180"` (a ' +
        "string, as the option's input writes it).",
      "`desaturate: true` is a plain display setting: grey whenever shown. Sub-elements: 1 the background, 2 the `%p` time " +
        "text, 3 a glow, off. Condition 1 (`expirationTime < 30`, Remaining Duration) lights the glow (`sub.3.glow`); " +
        "condition 2 turns the time text red under 10 seconds (`sub.2.text_color`).",
    ],
    body: { aura: tbcBuffUnderThreeMinutes },
    check: {
      situation: { triggers: { "1": { remaining: 20, duration: 3600 } } },
      shows: '`"shown": true`, `"activeConditions": [1]`, `"glows": [{"subRegion": 3, "lit": true}]`; with `"remaining": 600` it is not shown.',
    },
  },
  {
    key: "buff-missing",
    title: "1b. Buff missing",
    request: "Show the Arcane Intellect icon desaturated and glowing when the buff is missing.",
    explanation: [
      'Same trigger with Show On Aura(s) Missing: `matchesShowOn: "showOnMissing"` and `use_matchesShowOn: true`. The icon ' +
        "shows only while neither buff is on the player, so desaturating it and lighting its glow need no condition: " +
        "`desaturate: true` and the glow sub-element's `glow: true`.",
      "Push 1a and 1b as two auras: together they are the buff reminder.",
    ],
    body: { aura: tbcBuffMissing },
    check: {
      situation: { triggers: { "1": { present: false } } },
      shows: '`"shown": true` with `"glows": [{"subRegion": 2, "lit": true}]`; in the default situation (buff present) `"shown": false`.',
    },
  },
  {
    key: "cooldown-icon",
    title: "2. Cooldown icon that desaturates on cooldown",
    request: "Show Fire Blast's icon, greyed out while it is on cooldown.",
    explanation: [
      'Trigger 1 is the spell cooldown trigger: `type: "spell"`, `event: "Cooldown Progress (Spell)"`, `spellName` the spell ' +
        "ID as a number (27079, Fire Blast rank 9; the trigger follows the highest rank the player knows), " +
        '`genericShowOn: "showAlways"` with `use_genericShowOn: true` so the icon stays visible when ready.',
      "Condition 1 checks `onCooldown` (a boolean: `value: 1`, no operator) and sets `desaturate`. On TBC the cooldown's " +
        "remaining time (`expirationTime`) can be compared as well, in and out of combat.",
    ],
    body: { aura: tbcCooldownIcon },
    check: {
      situation: { triggers: { "1": { present: true, remaining: 5, duration: 8 } } },
      shows: '`"shown": true` with `"changed": {"desaturate": true}`; with `"present": false` (ready) `"changed": {}`.',
    },
  },
  {
    key: "target-debuff-bar",
    title: "3. Target debuff time-left bar",
    request: "Show a bar with the time left on my Corruption on the target.",
    explanation: [
      'An `aurabar` with the Aura trigger on `unit: "target"`, Debuff (`HARMFUL`), by name, own casts only (`ownOnly: true`).',
      "Sub-elements: 1 `subbackground` and 2 `subforeground` (every bar has them; they count in `sub.N`), 3 the name " +
        "(`%n`), 4 the time (`%p`). Condition 1 colours the time text red under 5 seconds (`sub.4.text_color`).",
    ],
    body: { aura: tbcTargetDebuffBar },
    check: {
      situation: { triggers: { "1": { remaining: 3, duration: 18 } } },
      shows: '`"shown": true`, `"changed": {"sub.4.text_color": [1, 0.2, 0.2, 1]}`; with `"targetExists": false` it is not shown.',
    },
  },
  {
    key: "v1-group",
    title: "4. A group holding these",
    request: "Put them together so I can import them in one go.",
    explanation: [
      'A `group` ("TBC v1 auras") with 1a, 1b, 2 and 3 as children (`c`). The children keep their tables; each gets ' +
        '`parent: "TBC v1 auras"` and an offset relative to the group\'s centre, and the group lists their ids in ' +
        "`controlledChildren`. One situation applies to all of them: trigger 1 is each child's own trigger 1.",
    ],
    body: tbcV1Group,
    check: {
      situation: { triggers: { "1": { present: false } } },
      shows: "`preview.displays` has the four children: 1b and 2 are shown, 1a and 3 are not.",
    },
  },
];

/** An example as the docs show it: wago JSON (the push body), without a sender or transmission version. */
export function tbcExampleWagoJson(e: TbcWorkedExample): string {
  const aura = canonicalize(e.body.aura as AuraDocument) as AuraDocument;
  const children = (e.body.children ?? []).map((c) => canonicalize(c as AuraDocument) as AuraDocument);
  return toWagoJson({ aura, children });
}
