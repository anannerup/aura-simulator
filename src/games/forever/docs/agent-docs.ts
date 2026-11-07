import type { OptionReference } from "@/core";
import { optionReferenceSection } from "../../docs/option-reference";
import { forever } from "..";
import { DEFAULT_WORKSPACE_ID } from "@/workspace";
import {
  compactJson,
  displayMediaNotes,
  gameDataSection,
  picturesSection,
  pushApiSection,
  situationSection,
  spellApiSection,
  wagoJsonSection,
  wagoLinksSection,
} from "../../docs/shared";
import { DOCUMENTED_REGION_TYPES, type AddonFacts, type ModernVariableFact } from "./addon-facts";
import { COUNTER_EXAMPLE, exampleWagoJson, WORKED_EXAMPLES, type WorkedExample } from "./worked-examples";

/** What the docs need from the running app. */
export interface AgentDocsFacts {
  /** Origin the app is reached at, e.g. "http://localhost:3000". */
  origin: string;
  /** The addon ref the server follows (shown even when it couldn't be loaded). */
  addonRef: string;
  /** Facts read from that addon version; null if it couldn't be loaded (the generated parts are then left out). */
  addon: AddonFacts | null;
  /**
   * The option ↔ table reference of that version (core.optionReference()); null while it is being generated or if
   * it couldn't be (the section then points to options.json).
   */
  optionReference?: OptionReference | null;
}

/** The API endpoints the docs describe, as `METHOD /path` with `<param>` placeholders. Tested to exist. */
export const DOCUMENTED_ENDPOINTS = [
  "POST /api/forever/workspaces/<id>/aura",
  "GET /api/forever/workspaces/<id>",
  "GET /api/forever/workspaces/<id>/events",
  "GET /api/forever/workspaces/<id>/situation",
  "PUT /api/forever/workspaces/<id>/situation",
  "GET /api/forever/workspaces/<id>/screenshot.png",
  "GET /api/forever/wago/<id>",
  "GET /api/forever/spells/search",
  "GET /api/forever/spells/<id>",
  "GET /api/forever/spells/status",
  "POST /api/forever/spells/sync",
  "GET /api/forever/items/search",
  "GET /api/forever/items/<id>",
  "GET /api/forever/icons/search",
  "GET /api/forever/files",
  "GET /api/forever/media",
] as const;

const code = (s: string) => `\`${s}\``;
const codes = (xs: Iterable<string>) => [...xs].map(code).join(", ");
const json = (v: unknown) => JSON.stringify(v);

function exampleBlock(e: WorkedExample): string {
  return `#### ${e.title}

Request: "${e.request}"

${e.explanation.join("\n\n")}

Expected answer: \`validation.combat.status\` is **${e.combat}**.

\`\`\`json example=${e.key} combat=${e.combat}
${compactJson(JSON.parse(exampleWagoJson(e)))}
\`\`\``;
}

/** Plain words for what an Aura (Modern) condition variable may change. */
function variableMayChange(v: ModernVariableFact, a: AddonFacts): string {
  const glow = v.glow ? `a glow (\`sub.N.glow\` set to \`true\`${v.glow.operator ? `, operator \`${v.glow.operator}\`` : ""})` : undefined;
  const highlight = "the native highlight";
  switch (v.family) {
    case "duration":
      return [glow, "the colour or visibility (`text_color`, `text_visible`) of a `%p` text"].filter(Boolean).join("; ");
    case "stack":
      return "a `%s` text (colour, visibility, text)";
    case "plain":
      return [glow, highlight].filter(Boolean).join("; ");
    case "select":
      return highlight;
    case "missing": {
      const roots = Object.entries(a.modern.missingRootProperties)
        .filter(([region]) => a.modern.missingRegionTypes.includes(region))
        .map(([region, props]) => `${region}: ${codes(props)}`)
        .join("; ");
      const elements = Object.entries(a.modern.elementProperties)
        .map(([el, props]) => [el, Object.keys(props).filter((k) => props[k].missing)] as const)
        .filter(([, keys]) => keys.length > 0)
        .map(([el, keys]) => `${el} ${codes(keys)}`)
        .join(", ");
      return `${roots}; elements: ${elements}; ${highlight}`;
    }
    default:
      return highlight;
  }
}

function generatedTriggerList(a: AddonFacts): string {
  const byStatus = (s: string) => a.triggers.filter((t) => t.event && t.combat === s);
  const special = a.triggers.filter((t) => !t.event);
  /** `type` (`event`, `event`, …) per trigger type. */
  const grouped = (list: AddonFacts["triggers"]) => {
    const byType = new Map<string, string[]>();
    for (const t of list) byType.set(t.type, [...(byType.get(t.type) ?? []), t.event!]);
    return [...byType].map(([type, events]) => `\`${type}\` (${events.map((e) => `"${e}"`).join(", ")})`).join("; ");
  };
  const sentence = (m: string) => m.replace(/\.*$/, "") + ".";
  const ok = byStatus("ok");
  const limited = byStatus("limited");
  const broken = byStatus("broken");
  return `What the addon's validation says about each trigger with its default options (generated). Triggers are
\`{"type": ..., "event": ...}\`; listed as type ("event", …):

${special.map((t) => `- ${t.name}: **${t.combat}**. ${sentence(t.message)}`).join("\n")}
- **ok** in combat: ${grouped(ok)}.
${limited.length ? `- **limited** in combat (the game hides the values these compare; display works, comparisons don't): ${grouped(limited)}.\n` : ""}${broken.length ? `- **broken**: ${broken.map((t) => `\`${t.type}\` "${t.event}": ${sentence(t.message)}`).join(" ")}\n` : ""}
Options matter: e.g. comparing a value the game hides in combat makes an ok trigger **limited**. Always read the
push answer.`;
}

function defaultsLine(doc: Record<string, unknown>): string {
  return Object.entries(doc)
    .map(([k, v]) => `\`${k}\`=${json(v)}`)
    .join(", ");
}

const MINIMAL_AURA = {
  id: "Arcane Intellect",
  regionType: "icon",
  displayIcon: 135932,
  triggers: {
    "[1]": { trigger: { type: "secretAura", unit: "player", debuffType: "HELPFUL", auraspellids: ["1459"] }, untrigger: {} },
    activeTriggerMode: -10,
  },
};

interface Ctx {
  /** The origin. */
  o: string;
  /** The default workspace id. */
  d: string;
  a: AddonFacts | null;
  version: string;
  /** The option ↔ table reference, when ready. */
  r: OptionReference | null;
  /** The addon ref links name. */
  ref: string;
}

/**
 * The agent docs as Markdown: served as-is at /forever/llms.txt and /forever/docs/agents.md, rendered at /forever/docs/agents.
 * Prose for the concepts; lists of types, triggers, condition variables and defaults come from the addon version.
 * One function per section, in order.
 */
export function agentDocsMarkdown(f: AgentDocsFacts): string {
  const a = f.addon;
  const version = a
    ? `Musca Auras ${a.addonRef} (WeakAuras ${a.addonVersion}, internalVersion ${a.internalVersion})`
    : `Musca Auras ${f.addonRef} (it could not be loaded just now, so the lists generated from it are missing; reload later)`;
  const ctx: Ctx = { o: f.origin, d: DEFAULT_WORKSPACE_ID, a, version, r: f.optionReference ?? null, ref: a?.addonRef ?? f.addonRef };
  const sections = [
    intro,
    workflow,
    wagoJson,
    auraDocument,
    fieldReference,
    triggers,
    conditions,
    optionTableReference,
    combatRules,
    validation,
    situation,
    pictures,
    spells,
    gameData,
    pushApi,
    wagoLinks,
    workedExamples,
    troubleshooting,
  ];
  return sections.map((section) => section(ctx)).join("\n");
}

function intro({ version }: Ctx): string {
  return `# Aura Simulator: docs for agents

Aura Simulator previews auras for **Musca Auras**, the WeakAuras fork for WoW Forever, the way the game draws them,
and checks them with the addon's own code. You (the agent) write an aura as **wago JSON** (the table wago.io shows
for an aura) and **push** it to a **workspace**; the player's open page (the **window** with the in-game **tabs**, beside a **game screen**) shows it
live. The player checks it, exports it as a file and imports it in the game.

This server follows ${version}. Lists marked *generated* below are read from that version. For another release,
add \`?ref=<version>\` to this page's address and to your pushes.

Contents: Workflow · wago JSON · The aura document · Field reference · Triggers · Conditions ·
Option ↔ table reference · Combat rules · Validation · Situation · Pictures · Spells · Items, icons and media ·
Push API · Wago links · Worked examples · Troubleshooting.
`;
}

function workflow({ o, d }: Ctx): string {
  return `## Workflow

1. **Pick a workspace.** Ask the player for theirs (the page shows its workspace id; it is the \`w\` in the address)
   or choose one (1-64 of \`A-Z a-z 0-9 _ -\`) and ask them to open \`${o}/forever?w=<id>\`. Without \`?w=\` the page follows
   \`${d}\`.
2. **Find spell IDs** with \`GET /api/forever/spells/search\` (Forever's IDs can differ from other WoW versions).
3. **Write the aura as wago JSON** (below), starting from the closest worked example.
4. **Push it**: \`POST /api/forever/workspaces/<id>/aura\` with the JSON as the body. Read \`validation\` in the answer. Fix errors; if
   \`combat.status\` is not \`ok\`, change the aura or tell the player exactly what stops working in combat.
5. **Show that it works**: set the situations the request is about (\`PUT /api/forever/workspaces/<id>/situation\`:
   buff missing, under 3 minutes left, in combat, …) and read \`preview\` (see Situation). The open page's game screen
   follows; the player can set the situation there too (frozen auras show a padlock in combat). The window's tabs
   (Display, Trigger, Conditions, …) show the options as in the game; the player may adjust them there.
   Working from the player's screenshot of an aura: take a picture of yours in each of those situations
   (\`GET /api/forever/workspaces/<id>/screenshot.png\`) at the screenshot's scale and compare (see Pictures).
6. **The player exports a file**: select the aura (or the group, to take everything in it) in the window's aura
   list → Export → **Save as file** (a \`.txt\` with the import string) or Copy to clipboard; **Save as .json** saves
   its wago JSON. The whole workspace can be saved as a workspace file.
7. **The player imports in the game**: open Musca Auras, click Import, paste the file's text, Import.

Don't paste import strings or links into the chat: push to the workspace and let the player export.
`;
}

const MINIMAL_WAGO_JSON = {
  d: {
    displayIcon: 135932,
    id: "Arcane Intellect",
    regionType: "icon",
    triggers: {
      "1": { trigger: { auraspellids: ["1459"], debuffType: "HELPFUL", type: "secretAura", unit: "player" }, untrigger: [] },
      activeTriggerMode: -10,
    },
  },
  m: "d",
};

function wagoJson(): string {
  return wagoJsonSection({ minimal: MINIMAL_WAGO_JSON, groupsBelow: true, defaultsBelow: true });
}

function auraDocument(): string {
  return `## The aura document

The other JSON form of an aura, kept for existing tools: \`{"aura": ..., "children": [...]}\` push bodies,
\`auraSimulator.state()\` and workspace files use it. It writes the Lua table as canonical JSON, where every key says
which Lua key it stands for:

- Strings, numbers and booleans are themselves. Lua has no null: leave a field out instead.
- A table whose keys are exactly 1..n (n >= 1) is a JSON **array**. Arrays can't have holes.
- Any other table, including the empty table \`{}\`, is a JSON **object**.
- Object keys say which Lua key they stand for: \`name\` is the string key "name"; \`[1]\` is the
  **number** key 1; \`[true]\` is the boolean key true; \`["[x"]\` is a string key that starts with "[".
  So \`{"1": ...}\` is Lua \`{["1"] = ...}\` and \`{"[1]": ...}\` is Lua \`{[1] = ...}\`.
- Mixed tables stay objects: \`triggers\` is \`{"[1]": {...}, "activeTriggerMode": -10}\`.
- Whole numbers must stay within ±(2^53 - 1). Colours are \`[r, g, b, a]\` from 0 to 1.
- Leave out what you don't need: the addon fills defaults (listed below) on import, as the game does.
- \`id\` is the aura's name and must be unique in the workspace.

A minimal aura:

\`\`\`json
${compactJson(MINIMAL_AURA)}
\`\`\`
`;
}

function fieldReference({ a, o, ref }: Ctx): string {
  return `## Field reference

Common to every display: \`id\`, \`regionType\`, \`anchorPoint\` (point of the screen or group), \`selfPoint\` (point
of the aura), \`xOffset\`/\`yOffset\` (pixels from the anchor; up and right are positive), \`width\`/\`height\`,
\`alpha\`, \`frameStrata\`, \`load\` (when it loads; \`{}\` = always), \`triggers\`, \`conditions\`, \`subRegions\`,
\`actions\`, \`animation\`. Points: \`CENTER\`, \`TOP\`, \`BOTTOM\`, \`LEFT\`, \`RIGHT\`, \`TOPLEFT\`, \`TOPRIGHT\`,
\`BOTTOMLEFT\`, \`BOTTOMRIGHT\`.

- \`icon\`: \`displayIcon\` (a FileDataID, see Spells, or an \`Interface\\Icons\\\` path; see Icons, textures, fonts
  and borders), \`desaturate\`, \`color\`, \`zoom\` (0-1), \`keepAspectRatio\`,
  \`cooldown\` (draw the cooldown swipe), \`cooldownSwipe\`, \`cooldownEdge\`, \`cooldownTextDisabled\`
  (hide the game's countdown numbers), \`inverse\`.
- \`aurabar\`: \`texture\` (a bar texture name, e.g. \`"Blizzard"\`, \`"Solid"\`), \`orientation\` (\`HORIZONTAL\`,
  \`HORIZONTAL_INVERSE\`, \`VERTICAL\`, \`VERTICAL_INVERSE\`), \`inverse\`, \`barColor\`, \`backgroundColor\`,
  \`icon\` (show the icon), \`icon_side\` (\`LEFT\`/\`RIGHT\`), \`icon_color\`, \`displayIcon\`, \`spark\` and
  \`spark*\`, \`enableGradient\`/\`barColor2\`. Its \`subRegions\` start with \`{"type": "subbackground"}\`,
  \`{"type": "subforeground"}\`.
- \`text\`: \`displayText\` (with format codes such as \`%p\`, \`%n\`, \`%s\`), \`font\`, \`fontSize\`, \`outline\`
  (\`None\`, \`OUTLINE\`, \`THICKOUTLINE\`), \`color\`, \`justify\`, \`automaticWidth\` (\`Auto\`/\`Fixed\`),
  \`fixedWidth\`, \`wordWrap\`, \`shadowColor\`/\`shadowXOffset\`/\`shadowYOffset\`.
- \`group\`: children keep their own anchors and offsets, relative to the group's centre. \`scale\`, \`border\` and
  \`border*\`/\`backdropColor\`.
- \`dynamicgroup\`: lays out the shown children: \`grow\` (\`RIGHT\`, \`LEFT\`, \`UP\`, \`DOWN\`, \`HORIZONTAL\`,
  \`VERTICAL\`, \`CIRCLE\`, \`COUNTERCIRCLE\`, \`GRID\`), \`align\`, \`space\`, \`stagger\`, \`useLimit\`/\`limit\`,
  \`radius\`, \`gridType\`/\`gridWidth\`, \`sort\` (Group tab options, see below). Shown children close up. A dynamic
  group holds no groups.

Format codes in texts: \`%p\` time left, \`%t\` total time, \`%n\` name, \`%s\` stacks, \`%i\` icon. Literal \`%\` is
\`%%\`.

### Sub-elements

\`subRegions\` is an array of elements drawn on the display; conditions address element N (1-based, counting
every element, backgrounds included) as \`sub.N.<key>\`.

- \`subtext\`: \`text_text\` (format codes), \`text_color\`, \`text_font\`, \`text_fontSize\`, \`text_fontType\`
  (\`None\`/\`OUTLINE\`/\`THICKOUTLINE\`), \`text_visible\`, \`text_justify\`, \`text_selfPoint\` (\`AUTO\`),
  \`anchor_point\` (\`CENTER\`, \`INNER_TOPLEFT\`, \`INNER_BOTTOMRIGHT\`, \`INNER_LEFT\`, \`INNER_RIGHT\`, \`OUTER_TOP\`, …),
  \`anchorXOffset\`/\`anchorYOffset\`, \`text_shadowColor\`.
- \`subglow\`: \`glow\` (on/off; usually \`false\`, turned on by a condition), \`glowType\` (\`buttonOverlay\`,
  \`Pixel\`, \`ACShine\` (autocast), \`Proc\`), \`useGlowColor\`/\`glowColor\`, \`glowLines\`, \`glowFrequency\`,
  \`glowLength\`, \`glowThickness\`, \`glowScale\`, \`glowXOffset\`/\`glowYOffset\`, \`anchor_area\` (bars:
  \`"bar"\` or \`"icon"\`).
- \`subborder\`: \`border_visible\`, \`border_color\`, \`border_edge\` (e.g. \`"Square Full White"\`),
  \`border_size\`, \`border_offset\` (how they draw: below), \`anchor_area\` (bars).
- \`subtick\` (bars only): \`tick_visible\`, \`tick_color\`, \`tick_placement_mode\` (\`AtValue\`, \`AtPercent\`),
  \`tick_placements\` (strings), \`tick_thickness\`, \`automatic_length\`/\`tick_length\`, \`use_texture\`.
- \`subbackground\`, \`subforeground\`: no fields; the display's own background and (bars) foreground.

\`subRegions\` is the whole list: an aura you write has exactly the elements you list. Nothing is merged with what
the window's New Aura gives a new aura (an icon gets a \`%s\` stack text and a glow there): to keep those, list them.
The addon itself only adds a missing \`subbackground\` first (and on bars a \`subforeground\`) and renumbers your
conditions' \`sub.N\` to match, so write them yourself and the numbers you write are the ones the window shows.

${displayMediaNotes({ game: "forever", origin: o, ref })}
${a ? generatedDefaults(a) : ""}
### Groups

A group is an aura with \`"regionType": "group"\` or \`"dynamicgroup"\`. It travels as its own table (wago JSON's \`d\`)
plus every descendant (\`c\`; \`children\` in the aura document), flattened in the addon's order (each group, then its
children, depth first).
A group's \`controlledChildren\` lists its children's \`id\`s and each child's \`parent\` is its group's \`id\`.
Without sub groups you may leave both out: every child then belongs to the group in the order given. With sub
groups, set them. Groups nest; a dynamic group holds no groups.
`;
}

function triggers({ a }: Ctx): string {
  return `## Triggers

\`\`\`json
"triggers": {"1": {"trigger": {...}, "untrigger": []}, "activeTriggerMode": -10}
\`\`\`

Trigger N is \`"N"\` in wago JSON (\`"[N]"\` in the aura document): a number key. \`activeTriggerMode\` -10 means "any trigger shows the aura"; a number N means
trigger N supplies the dynamic info (icon, time, stacks). Conditions refer to triggers by number.

### Aura (Modern) (\`"type": "secretAura"\`): use this for buffs and debuffs

The fork's combat-safe aura trigger: the game itself tracks the aura, so it keeps updating in combat.

- \`unit\`${a ? `: ${Object.entries(a.modern.units).map(([k, v]) => `\`${k}\` (${v})`).join(", ")} (generated)` : ""}. Single units: ${a ? codes(a.modern.singleUnits) : "`player`, `target`, `focus`, `pet`, …"}.
- \`debuffType\`: \`"HELPFUL"\` (Buff) or \`"HARMFUL"\` (Debuff). Required.
- \`auraspellids\`: exact spell IDs as **strings**, e.g. \`["1459"]\`; they also turn on the spell ID match
  (\`secretUseSpellIDs\`). Leave it out to match every aura of that kind.
- \`nativeFilters\`: Blizzard's own filters as \`{"KEY": true}\`${a ? `: ${a.modern.nativeFilters.map((n) => `\`${n.key}\` (${n.label}: ${n.description})`).join("; ")}` : ""}.
  Use \`{"PLAYER": true}\` for "cast by me".
- \`secretShowOn\` (Show On)${a ? `: ${Object.entries(a.modern.showOn).map(([k, v]) => `\`${k}\` (${v})`).join(", ")}` : ""}. Default: Aura(s) Found.
- Remaining Time window (icons only, Show On Aura(s) Found): \`secretUseRem: true\`, \`secretRemOperator\`
  (${a ? codes(a.modern.remOperators) : "`<`, `<=`, `>`, `>=`"}), \`secretRem\` (seconds). Shows the aura only inside the window.
- Stack filter (Show On Aura(s) Found, no Remaining Time window): \`secretUseStacks: true\`, \`secretStacksOperator\`
  (${a ? codes(a.modern.stackOperators) : "`=`, `>=`, …"}), \`secretStacks\` (0-${a?.modern.stackLimit ?? 100}).
- It drives ${a ? codes(a.modernRegionTypes) : "`icon`, `aurabar`, `progresstexture`, `text`"} displays. The aura's icon, time and stacks come from the game.

### Aura (\`"type": "aura2"\`): the classic trigger, mostly not for combat

\`aura2\` with names (\`useName\` + \`auranames\`) or spell IDs (\`useExactSpellId\` + \`auraspellids\`), tooltips or
own-only checks **freezes in combat**: it keeps its last state until combat ends (the game screen shows a padlock).
Only an \`aura2\` that matches by a native filter alone (\`useNativeFilter\` + \`nativeFilter\`, no names, IDs or other
checks) keeps working. For a known buff or debuff, use Aura (Modern) instead.

### Spell cooldown (\`"type": "spell"\`, \`"event": "Cooldown Progress (Spell)"\`)

\`spellName\` is the spell ID (a number). \`genericShowOn\` with \`use_genericShowOn: true\`: \`showAlways\`,
\`showOnCooldown\`, \`showOnReady\`. \`track\`: \`auto\`, \`cooldown\`, \`charges\`. \`desaturateOnCooldown: true\` greys the
icon while on cooldown. It keeps working in combat: the addon reads readiness even when the game hides the timing.
${a ? cooldownVerdicts(a) : ""}
### Other triggers

${a ? generatedTriggerList(a) : "The addon could not be loaded, so the trigger list is missing."}
`;
}

function conditions({ a }: Ctx): string {
  return `## Conditions

\`conditions\` is an array; each entry has a \`check\` and \`changes\`:

\`\`\`json
"conditions": [
  {"check": {"trigger": 1, "variable": "faAuraRemaining", "op": "<", "value": 180},
   "changes": [{"property": "sub.2.glow", "value": true}]}
]
\`\`\`

- \`check.trigger\`: the trigger number, or \`-1\` for global checks (e.g. \`{"trigger": -1, "variable": "incombat",
  "value": 1}\`).
- \`check.variable\`: one of the trigger's condition variables. Booleans use \`value: 1\` (true) or \`0\`, no \`op\`.
- \`check.op\`: \`<\`, \`<=\`, \`>\`, \`>=\`, \`==\`, \`~=\` for numbers; \`==\`, \`~=\`, \`find('%s')\`, \`match('%s')\` for text.
- Combining: \`{"variable": "AND", "checks": [...]}\` or \`"OR"\`; an entry with \`"linked": true\` is an "Else If" of
  the one before. Later conditions win when two change the same property.
- \`changes[].property\`: a display field (\`desaturate\`, \`color\`, \`alpha\`, \`width\`, …) or \`sub.N.<key>\` for
  sub-element N (\`sub.2.glow\`, \`sub.1.text_color\`). \`value\` is the new value while the check holds.
${a ? generatedConditionProperties(a) : ""}
### Aura (Modern) condition variables

On an Aura (Modern) trigger, conditions use these variables${a ? " (generated)" : ""}. Each may change only what is listed:
${a ? modernVariables(a) : "\n(The list is generated from the addon, which could not be loaded.)"}
`;
}

function generatedDefaults(a: AddonFacts): string {
  const subDefaults = Object.entries(a.subDefaults).map(([sub, def]) => `- \`${sub}\`: ${Object.keys(def).length ? defaultsLine(def) : "(none)"}`);
  const subTypes = a.subRegionTypes.map((s) => `\`${s.type}\` (${s.displayName}: ${s.supports.join(", ")})`);
  return `### Defaults (generated)

What the addon fills in when a field is left out (\`fillDefaults\`, the addon's own import path). Top-level values only:

${DOCUMENTED_REGION_TYPES.map((rt) => `- \`${rt}\`: ${defaultsLine(a.regionDefaults[rt] ?? {})}`).join("\n")}

Sub-element defaults:

${subDefaults.join("\n")}

All display types in this version (generated): ${codes(a.regionTypes)}. Sub-element types and the displays they
fit: ${subTypes.join("; ")}.
`;
}

function cooldownVerdicts(a: AddonFacts): string {
  return `Its condition variables and the addon's combat verdict for a condition on each (generated):
${a.cooldownConditions.map((c) => `\`${c.variable}\` (${c.label}): ${c.combat}`).join("; ")}.
`;
}

function generatedConditionProperties(a: AddonFacts): string {
  const lines = Object.entries(a.conditionProperties)
    .filter(([, props]) => Object.keys(props).length)
    .map(([rt, props]) => `- \`${rt}\`: ${Object.entries(props).map(([k, v]) => `\`${k}\` (${v})`).join(", ")}`);
  return `
Properties conditions can change per display (generated, key: options name):

${lines.join("\n")}
`;
}

function modernVariables(a: AddonFacts): string {
  const operators = (v: ModernVariableFact) => (v.operators.length ? `, operators ${codes(v.operators)}` : ", no operator or value");
  const known = (props: Record<string, Record<string, unknown>>) =>
    Object.entries(props)
      .map(([name, p]) => `${name} ${codes(Object.keys(p).sort())}`)
      .join("; ");
  return `
${a.modern.variables.map((v) => `- \`${v.variable}\` (${v.label})${operators(v)}: may change ${variableMayChange(v, a)}.`).join("\n")}

Properties these conditions know: on the display ${known(a.modern.rootProperties)}; on elements ${known(a.modern.elementProperties)}.
The native highlight is ${codes(a.modern.highlightProperties)}.`;
}

/** The option ↔ table reference: what it is, how its paths read as wago JSON keys, examples, where it is. */
function optionTableReference({ o, r, ref }: Ctx): string {
  return optionReferenceSection(o, forever.id, ref, r);
}

function combatRules(): string {
  return `## Combat rules

In WoW Forever the game hides many values from addons during combat. The rules, in plain words:

- **Buffs and debuffs: use Aura (Modern).** It is drawn by the game and keeps updating. An \`aura2\` trigger with
  names or spell IDs freezes until combat ends.
- **A time check (seconds left, elapsed, share) may only light a glow or change a \`%p\` text** (its colour or
  visibility). It can't desaturate, recolour, resize or fade the display. A glow from a time check needs operator
  \`<\` and the value \`true\`. One \`%p\` text follows one time basis.
- **Desaturate and colour work on the missing state**: \`faAuraMissing\` may change desaturate, colour (and zoom on
  icons), a text's colour or visibility and a glow. It needs Show On Aura(s) Missing or Always.
- **Time checks only count while the aura is up.** For "glow when it's gone" use \`faAuraMissing\`, not
  \`faAuraRemaining < 1\`.
- **Aura (Modern) checks can't be combined** with AND, OR or Else If. Use one condition per check.
- **One invalid Aura (Modern) condition stops all of the aura's conditions.** The answer says \`broken\`.
- **Other (generic) conditions on an Aura (Modern) display** that change a property the game draws (desaturate,
  colour, …) keep their last out-of-combat value in combat.
- **Spell cooldowns work in combat** with the \`onCooldown\` check or \`desaturateOnCooldown\`; comparing the
  cooldown's remaining time doesn't.
- **Health, power and threat triggers** can show their values in combat but not compare them.
- **The combat log is not available** on Forever: combat log triggers never fire.
`;
}

function validation(): string {
  return `## Validation

Every push answer has a \`validation\` field, from the real Musca Auras code:

\`\`\`json
{"errors": [], "warnings": [], "combat": {"status": "ok", "messages": ["Fully usable in combat."]}}
\`\`\`

- \`combat.status\`: \`ok\` (fully usable in combat), \`limited\` (works, but some parts stop updating or comparing in
  combat), \`broken\` (won't work as built).
- Each error or warning has a \`code\`, a \`severity\` (\`error\`, \`warning\`, \`info\`), a \`message\` in the addon's
  words, often a \`pointer\` (\`tab\`: the options tab's key, \`region\` for Display, \`trigger\`, \`conditions\`,
  \`action\` or \`animation\`; \`path\` of keys into the document; and a \`label\` such as
  "Condition 1, change 1 (desaturate)") and, in a group, the \`auraId\` it is about. Codes: \`modern.invalid\`
  (an Aura (Modern) rule is broken), \`modern.status\`, \`modern.notEligible\` (the display can't use the trigger),
  \`modern.note\` (a caution, e.g. "Hostile units only."), \`combat.hiddenValues\` (the game hides values this
  trigger compares), \`defaults.error\`, \`addon.<key>\` (warnings the addon raises, e.g. \`addon.forever_combat_log\`).

How to act:

- \`broken\` with \`modern.invalid\`: go to the \`pointer\` and change it the way the message says (usually: a glow or
  \`%p\` text instead of desaturate/colour, or \`faAuraMissing\` for the missing state). Push again.
- \`limited\` with \`combat.hiddenValues\`: switch to Aura (Modern) for buffs and debuffs, or drop the comparison.
  If no combat-safe version exists, push it anyway and tell the player what won't update in combat.
- \`ok\` with \`modern.note\`: pass the note on if it matters (e.g. a target aura that only shows on hostile units).
- Export is never blocked; the player decides.
`;
}

function situation({ o, d }: Ctx): string {
  return situationSection({
    game: "forever",
    origin: o,
    workspace: d,
    kinds: `What a trigger's situation means depends on the trigger: for Aura (Modern) and Aura (\`aura2\`) it is the buff
or debuff (present, time left, duration, stacks); for the spell cooldown trigger it is the cooldown (on cooldown, time
left, the cooldown, charges); any other trigger is active while "present". Only the target can be missing (Target
exists); every other unit exists.`,
    combat: `**In combat** is Forever's combat restriction: auras that freeze keep what they showed when combat started
(the game screen shows a padlock) and held properties keep their pre-combat value. Over HTTP, \`"inCombat": true\`
alone means nothing changed since combat started; to test freezing, add \`"beforeCombat"\` (the same fields:
\`targetExists\`, \`triggers\`) with the situation when combat started. \`preview\` then says \`"frozen": true\` for a
frozen display and lists \`heldInCombat\` properties.`,
    example: {
      situation: { triggers: { "1": { present: false } } },
      shows: "With worked example 1b (Arcane Intellect missing) pushed, this makes its `preview` say `\"shown\": true`.",
    },
  });
}

function spells({ o }: Ctx): string {
  return `## Spells

Use Forever's spell IDs. The server keeps a spell cache from wago.tools (Forever's own data) with icons and tooltips
from Wowhead.

${spellApiSection({ game: "forever", origin: o, whose: "Forever's", example: { name: "arcane intellect", id: 1459 } })}

- \`GET /api/forever/spells/status\` → whether the cache is synced; \`POST /api/forever/spells/sync\` refreshes it (slow, uses the
  internet; only when the player asks or the cache is empty).

Spell IDs go into Aura (Modern) and \`aura2\` triggers as strings (\`"auraspellids": ["1459"]\`) and into the spell
cooldown trigger as a number (\`"spellName": 2136\`).
`;
}

function gameData({ o }: Ctx): string {
  return gameDataSection({ game: "forever", origin: o, whose: "Forever's", item: { name: "major mana potion", id: 13444 }, icon: "food basilisk" });
}

function pictures({ o, d }: Ctx): string {
  return picturesSection({ game: "forever", origin: o, workspace: d, auraId: "Arcane Intellect" });
}

function pushApi({ o, d }: Ctx): string {
  return pushApiSection({ game: "forever", origin: o, workspace: d, checkName: "Combat check" });
}

function wagoLinks({ o, d }: Ctx): string {
  return wagoLinksSection({ game: "forever", origin: o, workspace: d });
}

function workedExamples(): string {
  return `## Worked examples

The v1 auras, each as complete wago JSON to push as the body (the tests push these exact blocks and check the
status). Buff reminder
1a (or its alternative) + 1b, cooldown icon 2, debuff bar 3, and group 4 holding them. Change ids, spell IDs (\`auraspellids\`,
\`spellName\`) and \`displayIcon\` for other spells.

${[...WORKED_EXAMPLES, COUNTER_EXAMPLE].map(exampleBlock).join("\n\n")}
`;
}

function troubleshooting(): string {
  return `## Troubleshooting

- **422 / the addon rejects it**: the JSON isn't a valid aura table. In wago JSON, check that \`d\` is the aura,
  that sequences outside \`triggers\` are arrays, and that trigger keys are \`"1"\`, \`"2"\`, …; in the aura document,
  number keys like \`"[1]"\`, arrays without holes, no nulls.
- **The aura doesn't show on the game screen**: check the situation controls (aura present or missing, target
  exists); Show On \`showOnMissing\` shows only while missing; a Remaining Time window hides it outside the window;
  \`load\` options may unload it.
- **Status \`broken\`, "Choose a supported property for this Aura (Modern) condition."**: a time or stack check
  changes something it may not (see Aura (Modern) condition variables).
- **"Aura Missing needs the trigger's Show On set to Aura(s) Missing or Always."**: set \`secretShowOn\`.
- **"To light a glow from a time check, compare with < and set the glow to on."**: use \`op: "<"\` and \`value: true\`.
- **\`sub.N\` changes the wrong element**: N counts every \`subRegions\` entry from 1, backgrounds included.
- **Padlock on the game screen in combat**: an \`aura2\` trigger freezes; use Aura (Modern).
- **A spell ID flagged \`not-in-game\`**: search by name for the Forever ID.
- **503**: the addon version is still loading or couldn't be fetched; retry in a moment.
`;
}
