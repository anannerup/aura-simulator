/**
 * TBC Anniversary's agent docs, served at /tbc/llms.txt, /tbc/docs/agents.md and /tbc/docs/agents: plain WeakAuras2,
 * no combat restrictions, worked examples as wago JSON (the TBC v1 auras, `worked-examples.ts`). Lists marked
 * generated come from the WeakAuras2 release (`addon-facts.ts`) and the option reference; the sections that are the
 * same concept in every game come from `src/games/docs/shared.ts`. One function per section, in order.
 */
import type { OptionReference } from "@/core";
import { DEFAULT_WORKSPACE_ID } from "@/workspace";
import { optionReferenceSection, optionReferenceUrls } from "../../docs/option-reference";
import { compactJson, pushApiSection, situationSection, spellApiSection, wagoJsonSection, wagoLinksSection } from "../../docs/shared";
import { tbc } from "..";
import { TBC_MINIMAL_WAGO_JSON } from "../examples";
import type { TbcAddonFacts } from "./addon-facts";
import { TBC_WORKED_EXAMPLES, tbcExampleWagoJson, type TbcWorkedExample } from "./worked-examples";

export interface TbcAgentDocsFacts {
  /** Origin the app is reached at, e.g. "http://localhost:3000". */
  origin: string;
  /** The release the server follows (shown even when it couldn't be loaded). */
  addonRef: string;
  /** Facts read from that release; null if it couldn't be loaded (the generated lists are then left out). */
  addon: TbcAddonFacts | null;
  /** The option ↔ table reference of that release; null while it is being generated or if it couldn't be. */
  optionReference?: OptionReference | null;
}

/** The API endpoints the docs describe, as `METHOD /path` with `<param>` placeholders. Tested to exist. */
export const TBC_DOCUMENTED_ENDPOINTS = [
  "POST /api/tbc/workspaces/<id>/aura",
  "GET /api/tbc/workspaces/<id>",
  "DELETE /api/tbc/workspaces/<id>",
  "GET /api/tbc/workspaces/<id>/events",
  "GET /api/tbc/workspaces/<id>/situation",
  "PUT /api/tbc/workspaces/<id>/situation",
  "GET /api/tbc/wago/<id>",
  "GET /api/tbc/spells/search",
  "GET /api/tbc/spells/<id>",
] as const;

const code = (s: string) => `\`${s}\``;
const codes = (xs: Iterable<string>) => [...xs].map(code).join(", ");

interface Ctx {
  o: string;
  d: string;
  a: TbcAddonFacts | null;
  version: string;
  r: OptionReference | null;
  ref: string;
}

export function tbcAgentDocsMarkdown(f: TbcAgentDocsFacts): string {
  const a = f.addon;
  const version = a
    ? `WeakAuras ${a.addonRef} (internalVersion ${a.internalVersion}), the release zip TBC Anniversary players install`
    : `WeakAuras ${f.addonRef} (it could not be loaded just now, so the lists generated from it are missing; reload later)`;
  const ctx: Ctx = { o: f.origin, d: DEFAULT_WORKSPACE_ID, a, version, r: f.optionReference ?? null, ref: a?.addonRef ?? f.addonRef };
  const sections = [
    intro,
    workflow,
    wagoJson,
    theAura,
    triggers,
    conditions,
    addonLists,
    optionTableReference,
    situation,
    validation,
    spells,
    pushApi,
    wagoLinks,
    workedExamples,
    troubleshooting,
  ];
  return sections.map((section) => section(ctx)).join("\n");
}

function intro({ version }: Ctx): string {
  return `# Aura Simulator: docs for agents (TBC Anniversary)

Aura Simulator previews auras for official **WeakAuras** on **TBC Anniversary** the way the game draws them, and
checks them with the addon's own code. You (the agent) write an aura as **wago JSON** (the table wago.io shows for an
aura) and **push** it to a **workspace** over HTTP; the answer says what the addon thinks of it and what it shows in a
situation you set. The player's open page (the **window** with the in-game **tabs**, beside a **game screen**) shows
it live. The player exports it and imports it in the game. No browser is needed for any of this.

This server follows ${version}. Lists marked *generated* below are read from that release. For another release,
add \`?ref=<version>\` to this page's address and to your pushes.

TBC Anniversary has **no combat restrictions**: auras read full aura information in and out of combat, so there are
no combat rules and no combat check. Write auras as for plain WeakAuras2. Spell IDs are TBC Anniversary's (see Spells).

A minimal aura, ready to push:

\`\`\`json push
${JSON.stringify(TBC_MINIMAL_WAGO_JSON)}
\`\`\`

Contents: Workflow · wago JSON · The aura · Triggers · Conditions · The addon (generated) · Option ↔ table
reference · Situation · Validation · Spells · Push API · Wago links · Worked examples · Troubleshooting.
`;
}

function workflow({ o, d }: Ctx): string {
  return `## Workflow

1. **Pick a workspace.** Ask the player for theirs (the page shows its workspace id; it is the \`w\` in the address)
   or choose one (1-64 of \`A-Z a-z 0-9 _ -\`) and ask them to open \`${o}/tbc?w=<id>\`. Without \`?w=\` the page follows
   \`${d}\`.
2. **Find spell IDs and names** with \`GET /api/tbc/spells/search\` (TBC's IDs and ranks differ from other WoW versions).
3. **Write the aura as wago JSON** (below), starting from the closest worked example. To find the keys an option of
   the window writes, use the option ↔ table reference.
4. **Push it**: \`POST /api/tbc/workspaces/<id>/aura\` with the JSON as the body. Read \`validation\` in the answer and
   fix errors.
5. **Show that it works**: set the situations the request is about (\`PUT /api/tbc/workspaces/<id>/situation\`: the
   buff missing, under 3 minutes left, no target, …) and read \`preview\` (see Situation). The open page's game screen
   follows.
6. **The player exports a file**: select the aura (or the group) in the window's aura list → Export → **Save as file**
   (a \`.txt\` with the import string) or Copy to clipboard; **Save as .json** saves its wago JSON. Or hand them the
   push answer's \`code\` as a \`.txt\` file (see Handing the player a file).
7. **The player imports in the game**: type \`/wa\`, click Import, paste the import string, Import.

Don't paste import strings or links into the chat: push to the workspace and let the player export.
`;
}

function wagoJson(): string {
  return wagoJsonSection({ minimal: TBC_MINIMAL_WAGO_JSON, groupsBelow: false, defaultsBelow: false });
}

function theAura(): string {
  return `## The aura

Common to every display: \`id\` (its name, unique), \`regionType\`, \`anchorPoint\` (point of the screen or group),
\`selfPoint\` (point of the aura), \`xOffset\`/\`yOffset\` (pixels from the anchor; up and right are positive),
\`width\`/\`height\`, \`alpha\`, \`frameStrata\`, \`load\` (when it loads; leave it out to always load), \`triggers\`,
\`conditions\`, \`subRegions\`, \`actions\`, \`animation\`. Points: \`CENTER\`, \`TOP\`, \`BOTTOM\`, \`LEFT\`, \`RIGHT\`,
\`TOPLEFT\`, \`TOPRIGHT\`, \`BOTTOMLEFT\`, \`BOTTOMRIGHT\`.

- \`icon\`: \`displayIcon\` (icon file ID, \`inGame.iconFileId\` from Spells; the trigger's own icon is used when it
  has one), \`desaturate\`, \`color\`, \`zoom\` (0-1), \`keepAspectRatio\`, \`cooldown\` (draw the cooldown swipe),
  \`cooldownTextDisabled\` (hide the game's countdown numbers), \`inverse\`.
- \`aurabar\`: \`texture\` (a bar texture name, e.g. \`"Blizzard"\`), \`orientation\` (\`HORIZONTAL\`,
  \`HORIZONTAL_INVERSE\`, \`VERTICAL\`, \`VERTICAL_INVERSE\`), \`inverse\`, \`barColor\`, \`backgroundColor\`, \`icon\`
  (show the icon), \`icon_side\` (\`LEFT\`/\`RIGHT\`), \`spark\`.
- \`text\`: \`displayText\` (with format codes), \`font\`, \`fontSize\`, \`outline\`, \`color\`, \`justify\`.
- \`group\` (children keep their own offsets, relative to the group's centre) and \`dynamicgroup\` (lays out the shown
  children: \`grow\`, \`align\`, \`space\`, \`sort\`).

Format codes in texts: \`%p\` time left, \`%t\` total time, \`%n\` name, \`%s\` stacks, \`%i\` icon. Literal \`%\` is
\`%%\`. The option ↔ table reference has every option of every display type with its keys, values and defaults.

### Sub-elements

\`subRegions\` is an array of elements drawn on the display; conditions address element N (1-based, counting every
element, backgrounds included) as \`sub.N.<key>\`.

- \`subtext\`: \`text_text\` (format codes), \`text_color\`, \`text_font\`, \`text_fontSize\`, \`text_fontType\`
  (\`None\`/\`OUTLINE\`/\`THICKOUTLINE\`), \`text_visible\`, \`text_justify\`, \`text_selfPoint\` (\`AUTO\`),
  \`anchor_point\` (\`CENTER\`, \`INNER_TOPLEFT\`, \`INNER_BOTTOMRIGHT\`, \`INNER_LEFT\`, \`INNER_RIGHT\`, \`OUTER_TOP\`,
  \`OUTER_BOTTOM\`, …), \`text_anchorXOffset\`/\`text_anchorYOffset\` (X/Y Offset; the \`anchorXOffset\` keys new sub
  texts carry are never read). Custom text (\`%c\`) isn't evaluated: it draws as a marked \`[%c]\`.
- \`subglow\`: \`glow\` (on/off), \`glowType\` (\`buttonOverlay\`, \`Pixel\`, \`ACShine\`, \`Proc\`),
  \`useGlowColor\`/\`glowColor\`.
- \`subborder\`: \`border_visible\`, \`border_color\`, \`border_edge\`, \`border_size\`.
- \`subtick\` (bars only), \`subbackground\`, \`subforeground\` (no fields: the display's own background and a bar's
  foreground).

\`subRegions\` is the whole list: an aura you write has exactly the elements you list. Nothing is merged with what
the window's New Aura gives a new aura (an icon gets a \`%s\` stack text and a glow there): to keep those, list them.
The addon itself only adds a missing \`subbackground\` first (and on bars a \`subforeground\`) and renumbers your
conditions' \`sub.N\` to match, so write them yourself and the numbers you write are the ones the window shows.

### Groups

A group is an aura with \`"regionType": "group"\` or \`"dynamicgroup"\`. In wago JSON it is \`d\` and every descendant
is in \`c\`, flattened (each group, then its children, depth first). A group's \`controlledChildren\` lists its
children's \`id\`s and each child's \`parent\` is its group's \`id\`. Worked example 4 is one.
`;
}

function triggers(): string {
  return `## Triggers

\`\`\`json
"triggers": {"1": {"trigger": {...}, "untrigger": []}, "activeTriggerMode": -10}
\`\`\`

Trigger N is \`"N"\` in wago JSON: a number key. \`activeTriggerMode\` -10 means the first active trigger supplies the
dynamic info (icon, time, stacks); a number N means trigger N does. \`disjunctive\` \`"any"\` (the default) shows the
aura while any trigger is active, \`"all"\` while all are. Conditions refer to triggers by number.

### Aura (\`"type": "aura2"\`): buffs and debuffs

- \`unit\`: \`player\`, \`target\`, \`focus\`, \`pet\`, \`group\` (Smart Group), \`party\`, \`raid\`, \`boss\`, \`arena\`,
  \`nameplate\`, \`member\` (with \`specificUnit\`), …
- \`debuffType\`: \`"HELPFUL"\` (Buff) or \`"HARMFUL"\` (Debuff).
- Which auras: by name, \`useName: true\` with \`auranames: ["Arcane Intellect"]\` (every rank; the names are the
  game client's, so English names need an English client), or by exact spell ID, \`useExactSpellId: true\` with
  \`auraspellids: ["27126"]\` (strings; one rank each). Both lists may hold several.
- \`ownOnly: true\`: only the player's own casts (\`false\`: only others'; leave it out for both).
- Show On: \`matchesShowOn\` \`"showOnActive"\` (Aura(s) Found, the default), \`"showOnMissing"\`, \`"showAlways"\`, with
  \`use_matchesShowOn: true\`. \`unitExists: true\` shows a Missing/Always trigger also when the unit doesn't exist.
- Remaining Time: \`useRem: true\`, \`remOperator\` (\`<\`, \`<=\`, \`==\`, \`>\`, \`>=\`, \`~=\`), \`rem\` (seconds, as a string).
  Stack Count: \`useStacks: true\`, \`stacksOperator\`, \`stacks\`.

### Spell cooldown (\`"type": "spell"\`, \`"event": "Cooldown Progress (Spell)"\`)

\`spellName\` is the spell ID (a number); the trigger follows the highest rank of that spell the player knows
(\`use_exact_spellName: true\` for exactly that ID). \`genericShowOn\` with \`use_genericShowOn: true\`:
\`showAlways\`, \`showOnCooldown\`, \`showOnReady\`. \`track\`: \`auto\`, \`cooldown\`, \`charges\`.

### Other triggers

Every trigger type and event the release has is listed under The addon (generated); the option ↔ table reference has
each one's options (\`trigger-<type>\` parts).
`;
}

function conditions({ a }: Ctx): string {
  return `## Conditions

\`conditions\` is an array; each entry has a \`check\` and \`changes\`:

\`\`\`json
"conditions": [
  {"check": {"trigger": 1, "variable": "expirationTime", "op": "<", "value": "30"},
   "changes": [{"property": "sub.3.glow", "value": true}]}
]
\`\`\`

- \`check.trigger\`: the trigger number, or \`-1\` for global checks (\`incombat\`, \`hastarget\`, \`attackabletarget\`,
  \`alwaystrue\`, \`customcheck\`, \`rangecheck\`), e.g. \`{"trigger": -1, "variable": "incombat", "value": 1}\`.
- \`check.variable\` on an Aura trigger: \`expirationTime\` (Remaining Duration), \`duration\` (Total Duration),
  \`stacks\`, \`name\`, \`spellId\`, \`unitCaster\`, \`show\` (Active), … On the spell cooldown trigger:
  \`onCooldown\`, \`expirationTime\`, \`duration\`, \`charges\`, … Every variable per trigger type is a choice of the
  Conditions tab's "If" in the option ↔ table reference (its \`conditions\` part).
- Booleans use \`value: 1\` (true) or \`0\`, no \`op\`. Numbers: \`op\` \`<\`, \`<=\`, \`>\`, \`>=\`, \`==\`, \`~=\`, with
  \`value\` as the options write it (a string such as \`"30"\`). Text: \`==\`, \`~=\`, \`find('%s')\`, \`match('%s')\`.
- Combining: \`{"trigger": -2, "variable": "AND", "checks": [...]}\` or \`"OR"\`; an entry with \`"linked": true\` is an
  "Else If" of the one before. Later conditions win when two change the same property.
- \`changes[].property\`: a display property (\`desaturate\`, \`color\`, \`alpha\`, …) or \`sub.N.<key>\` for
  sub-element N (\`sub.3.glow\`, \`sub.2.text_color\`). \`value\` is the new value while the check holds.
- Nothing changes in combat on TBC: every condition works the same in and out of combat.
${a ? conditionProperties(a) : ""}`;
}

function conditionProperties(a: TbcAddonFacts): string {
  const lines = Object.entries(a.conditionProperties)
    .filter(([, props]) => Object.keys(props).length)
    .map(([rt, props]) => `- \`${rt}\`: ${Object.entries(props).map(([k, v]) => `\`${k}\` (${v})`).join(", ")}`);
  return `
Display properties conditions can change, per display (generated, key: options name); sub-element properties are
\`sub.N.<key>\` of the element's fields:

${lines.join("\n")}
`;
}

function addonLists({ a }: Ctx): string {
  if (!a) return `## The addon\n\nThe addon could not be loaded, so the generated lists are missing.\n`;
  const triggerLines = a.triggers
    .map((t) => `- \`${t.type}\`${t.events.length ? `: ${t.events.map((e) => `"${e.event}"`).join(", ")}` : ""}`)
    .join("\n");
  return `## The addon (generated)

Display types (\`regionType\`): ${codes(a.regionTypes)}.

Sub-element types (\`subRegions[].type\`) and the displays they fit:
${a.subRegionTypes.map((s) => `- \`${s.type}\` (${s.displayName}): ${s.supports.join(", ")}`).join("\n")}

Trigger types (\`trigger.type\`) and their events (\`trigger.event\`). Buffs and debuffs use \`aura2\` ("Aura"):
${triggerLines}
`;
}

/** The option ↔ table reference: which wago JSON keys each option writes, and back (generated from the release). */
function optionTableReference({ o, r, ref }: Ctx): string {
  return optionReferenceSection(o, tbc.id, ref, r);
}

function situation({ o, d }: Ctx): string {
  return situationSection({
    game: "tbc",
    origin: o,
    workspace: d,
    kinds: `What a trigger's situation means depends on the trigger: for an Aura trigger (\`aura2\`) it is the buff or debuff
(present, time left, duration, stacks); for the spell cooldown trigger it is the cooldown (on cooldown, time left,
the cooldown, charges); for Item Count, \`stacks\` is the item count (\`"present": false\`: none in the bags) and the
trigger is active whatever the count unless its own Item Count filter (\`use_count\`, \`count\`, \`count_operator\`)
fails. Any other trigger's \`present\` is whether what it watches is there (found, on cooldown, enchanted, …); its own
show option decides whether that makes it active: \`genericShowOn\` \`showOnReady\`/\`showAlways\` (cooldowns),
Weapon Enchant's \`showOn\` \`showOnMissing\`/\`showAlways\`, or Inverse (\`use_inverse\`). The "Active" condition
(\`show\`) is whether a trigger is active. Only the target can be missing (Target exists); every other unit exists.`,
    combat: `**In combat** changes nothing on TBC but what the global "In Combat" condition (\`incombat\`) reads: there are no
combat restrictions.`,
    example: {
      situation: { triggers: { "1": { present: false } } },
      shows: "With worked example 1b (Arcane Intellect missing) pushed, this makes its `preview` say `\"shown\": true`.",
    },
  });
}

function validation(): string {
  return `## Validation

Every push answer has a \`validation\` field from the real WeakAuras code (no combat verdict on TBC):

\`\`\`json
{"errors": [], "warnings": []}
\`\`\`

Each error or warning has a \`code\`, a \`severity\` (\`error\`, \`warning\`, \`info\`), a \`message\` in the addon's
words, often a \`pointer\` (\`tab\`: the options tab's key, \`region\` for Display, \`trigger\`, \`conditions\`,
\`action\`, \`animation\`; \`path\` into the document; a \`label\`) and, in a group, the \`auraId\` it is about. Fix
errors and push again; pass warnings on to the player when they matter. Export is never blocked.
`;
}

function spells({ o }: Ctx): string {
  return `## Spells

Use TBC Anniversary's spell IDs (wago.tools' \`wow_anniversary\` data, with tooltips from Wowhead's TBC database).
TBC spells have ranks: each rank is its own ID with the same name.

${spellApiSection({ game: "tbc", origin: o, whose: "TBC Anniversary's", example: { name: "arcane intellect", id: 27126 } })}

Spell IDs go into the Aura trigger as strings (\`"auraspellids": ["27126"]\`, one rank each; or match every rank by
name with \`auranames\`) and into the spell cooldown trigger as a number (\`"spellName": 27079\`).

Finding a buff by what it does: search names, not effects. Many buffs share a name (food buffs are "Well Fed"): search
the name, read the candidates' \`buff\` text (what the buff says in game) with the lookup, and use the IDs that match.
`;
}

function pushApi({ o, d }: Ctx): string {
  return pushApiSection({ game: "tbc", origin: o, workspace: d, checkName: "Addon check" });
}

function wagoLinks({ o, d }: Ctx): string {
  return wagoLinksSection({ game: "tbc", origin: o, workspace: d });
}

function exampleBlock(e: TbcWorkedExample): string {
  return `#### ${e.title}

Request: "${e.request}"

${e.explanation.join("\n\n")}

Expected answer: \`validation\` has no errors and no warnings. Check it: set the situation
\`${JSON.stringify(e.check.situation)}\` and \`preview\` says ${e.check.shows}

\`\`\`json example=${e.key}
${compactJson(JSON.parse(tbcExampleWagoJson(e)))}
\`\`\``;
}

function workedExamples({ o, ref }: Ctx): string {
  return `## Worked examples

The TBC v1 auras, each as complete wago JSON to push as the body (the tests push these exact blocks). Buff reminder
1a + 1b, cooldown icon 2, debuff bar 3, and group 4 holding them. Change ids, names or spell IDs (\`auranames\`,
\`auraspellids\`, \`spellName\`) and \`displayIcon\` for other spells. All of them use only the regular triggers and
work the same in and out of combat. The options they use are in the option ↔ table reference
(\`${optionReferenceUrls(o, tbc.id, ref).part("trigger-aura2")}\` for the Aura trigger).

${TBC_WORKED_EXAMPLES.map(exampleBlock).join("\n\n")}
`;
}

function troubleshooting(): string {
  return `## Troubleshooting

- **422 / the addon rejects it**: the JSON isn't a valid aura table. Check that \`d\` is the aura, that sequences
  outside \`triggers\` are arrays, and that trigger keys are \`"1"\`, \`"2"\`, ….
- **\`preview\` says \`"shown": false\`**: check the situation (aura present or missing, time left inside a Remaining
  Time window, target exists); Show On \`showOnMissing\` shows only while missing; \`load\` options may unload it (leave
  \`load\` out to always load). With an override in \`auras\`, that aura sees its own triggers.
- **\`sub.N\` changes the wrong element**: N counts every \`subRegions\` entry from 1, backgrounds included; the addon
  adds a missing \`subbackground\` first.
- **A text draws nothing or the wrong thing**: read \`preview\`'s \`texts\`, what each text draws. A condition that
  only makes an empty text visible draws nothing; change \`sub.N.text_text\` too. \`[%c]\` with
  \`"customText": "not evaluated"\` is custom text the simulator doesn't run: check it in game.
- **A text's X/Y Offset does nothing**: it is \`text_anchorXOffset\`/\`text_anchorYOffset\`, not \`anchorXOffset\`.
- **Every icon shows the same count or time**: the situation's triggers are workspace-wide; give each aura its own with
  \`auras\` (see Situation).
- **A trigger with Show Always never hides, or Item Count is always shown**: that is the game's behaviour; Item
  Count hides only through its Item Count filter or a condition (e.g. \`stacks\` \`==\` \`0\`).
- **A name match doesn't find the aura in game**: names are the client's language; use exact spell IDs for other
  languages.
- **503**: the addon release is still loading or couldn't be fetched; retry in a moment.
`;
}
