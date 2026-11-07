import { DEFAULT_WORKSPACE_ID } from "@/workspace";
import { DOCUMENTED_REGION_TYPES, type AddonFacts, type ModernVariableFact } from "./addon-facts";
import { COUNTER_EXAMPLE, WORKED_EXAMPLES, type WorkedExample } from "./worked-examples";

/** What the docs need from the running app. */
export interface AgentDocsFacts {
  /** Origin the app is reached at, e.g. "http://localhost:3000". */
  origin: string;
  /** The addon ref the server follows (shown even when it couldn't be loaded). */
  addonRef: string;
  /** Facts read from that addon version; null if it couldn't be loaded (the generated parts are then left out). */
  addon: AddonFacts | null;
}

/** The API endpoints the docs describe, as `METHOD /path` with `<param>` placeholders. Tested to exist. */
export const DOCUMENTED_ENDPOINTS = [
  "POST /api/forever/workspaces/<id>/aura",
  "GET /api/forever/workspaces/<id>",
  "GET /api/forever/workspaces/<id>/events",
  "GET /api/forever/spells/search",
  "GET /api/forever/spells/<id>",
  "GET /api/forever/spells/status",
  "POST /api/forever/spells/sync",
] as const;

const code = (s: string) => `\`${s}\``;
const codes = (xs: Iterable<string>) => [...xs].map(code).join(", ");
const json = (v: unknown) => JSON.stringify(v);

/** JSON with 2-space indents, but anything that fits on one line (up to `width` columns) stays on one line. */
function compactJson(value: unknown, width = 110, indent = ""): string {
  const flat = JSON.stringify(value);
  if (flat === undefined || value === null || typeof value !== "object" || indent.length + flat.length <= width) return flat;
  const inner = indent + "  ";
  if (Array.isArray(value)) return `[\n${value.map((v) => inner + compactJson(v, width, inner)).join(",\n")}\n${indent}]`;
  const entries = Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${compactJson(v, width, inner)}`);
  return `{\n${entries.join(",\n")}\n${indent}}`;
}

function exampleBlock(e: WorkedExample): string {
  return `#### ${e.title}

Request: "${e.request}"

${e.explanation.join("\n\n")}

Expected answer: \`validation.combat.status\` is **${e.combat}**.

\`\`\`json example=${e.key} combat=${e.combat}
${compactJson(e.body)}
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
  const ctx: Ctx = { o: f.origin, d: DEFAULT_WORKSPACE_ID, a, version };
  const sections = [
    intro,
    workflow,
    auraDocument,
    fieldReference,
    triggers,
    conditions,
    combatRules,
    validation,
    spells,
    pushApi,
    workedExamples,
    troubleshooting,
  ];
  return sections.map((section) => section(ctx)).join("\n");
}

function intro({ version }: Ctx): string {
  return `# Aura Simulator: docs for agents

Aura Simulator previews auras for **Musca Auras**, the WeakAuras fork for WoW Forever, the way the game draws them,
and checks them with the addon's own code. You (the agent) build an aura as a JSON document and **push** it to a
**workspace**; the player's open page (the **window** with the in-game **tabs**, beside a **game screen**) shows it
live. The player checks it, exports it as a file and imports it in the game.

This server follows ${version}. Lists marked *generated* below are read from that version. For another release,
add \`?ref=<version>\` to this page's address and to your pushes.

Contents: Workflow · The aura document · Field reference · Triggers · Conditions · Combat rules · Validation ·
Spells · Push API · Worked examples · Troubleshooting.
`;
}

function workflow({ o, d }: Ctx): string {
  return `## Workflow

1. **Pick a workspace.** Ask the player for theirs (the page shows its workspace id; it is the \`w\` in the address)
   or choose one (1-64 of \`A-Z a-z 0-9 _ -\`) and ask them to open \`${o}/forever?w=<id>\`. Without \`?w=\` the page follows
   \`${d}\`.
2. **Find spell IDs** with \`GET /api/forever/spells/search\` (Forever's IDs can differ from other WoW versions).
3. **Build the aura document** (below), starting from the closest worked example.
4. **Push it**: \`POST /api/forever/workspaces/<id>/aura\`. Read \`validation\` in the answer. Fix errors; if
   \`combat.status\` is not \`ok\`, change the aura or tell the player exactly what stops working in combat.
5. **The player checks it** on the game screen: the situation controls set time left, aura present or missing,
   stacks, target exists and **in combat** (frozen auras show a padlock). The window's tabs (Display, Trigger,
   Conditions, …) show the options as in the game; the player may adjust them there.
6. **The player exports a file**: select the aura (or the group, to take everything in it) in the window's aura
   list → Export → **Save as file** (a \`.txt\` with the import string) or Copy to clipboard. The whole workspace can
   be saved as a workspace file.
7. **The player imports in the game**: open Musca Auras, click Import, paste the file's text, Import.

Don't paste import strings or links into the chat: push to the workspace and let the player export.
`;
}

function auraDocument(): string {
  return `## The aura document

An aura is the Lua table the addon stores for it, written as JSON (the canonical form; the app returns
documents in this form and accepts anything that canonicalizes to it):

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

function fieldReference({ a }: Ctx): string {
  return `## Field reference

Common to every display: \`id\`, \`regionType\`, \`anchorPoint\` (point of the screen or group), \`selfPoint\` (point
of the aura), \`xOffset\`/\`yOffset\` (pixels from the anchor; up and right are positive), \`width\`/\`height\`,
\`alpha\`, \`frameStrata\`, \`load\` (when it loads; \`{}\` = always), \`triggers\`, \`conditions\`, \`subRegions\`,
\`actions\`, \`animation\`. Points: \`CENTER\`, \`TOP\`, \`BOTTOM\`, \`LEFT\`, \`RIGHT\`, \`TOPLEFT\`, \`TOPRIGHT\`,
\`BOTTOMLEFT\`, \`BOTTOMRIGHT\`.

- \`icon\`: \`displayIcon\` (icon file ID; see Spells), \`desaturate\`, \`color\`, \`zoom\` (0-1), \`keepAspectRatio\`,
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
  \`radius\`, \`gridType\`/\`gridWidth\`, \`sort\`. Shown children close up. A dynamic group holds no groups.

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
  \`border_size\`, \`border_offset\`, \`anchor_area\` (bars).
- \`subtick\` (bars only): \`tick_visible\`, \`tick_color\`, \`tick_placement_mode\` (\`AtValue\`, \`AtPercent\`),
  \`tick_placements\` (strings), \`tick_thickness\`, \`automatic_length\`/\`tick_length\`, \`use_texture\`.
- \`subbackground\`, \`subforeground\`: no fields; the display's own background and (bars) foreground.

${a ? generatedDefaults(a) : ""}
### Groups

A group is an aura document with \`"regionType": "group"\` or \`"dynamicgroup"\`. It travels as its own document
plus \`children\`: every descendant, flattened in the addon's order (each group, then its children, depth first).
A group's \`controlledChildren\` lists its children's \`id\`s and each child's \`parent\` is its group's \`id\`.
Without sub groups you may leave both out: every child then belongs to the group in the order given. With sub
groups, set them. Groups nest; a dynamic group holds no groups.
`;
}

function triggers({ a }: Ctx): string {
  return `## Triggers

\`\`\`json
"triggers": {"[1]": {"trigger": {...}, "untrigger": {}}, "activeTriggerMode": -10}
\`\`\`

Trigger N is \`"[N]"\` (a number key). \`activeTriggerMode\` -10 means "any trigger shows the aura"; a number N means
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

function spells({ o }: Ctx): string {
  return `## Spells

Use Forever's spell IDs. The server keeps a spell cache from wago.tools (Forever's own data) with icons and tooltips
from Wowhead.

- \`GET /api/forever/spells/search?q=<name or ID>&limit=<1-100>\` → \`{"query", "build", "results": [{"id", "name", "icon",
  "iconUrl"}]}\`.
- \`GET /api/forever/spells/<id>\` → \`{"id", "found", "name", "icon", "iconUrl", "tooltip", "inGame": {"name", "icon",
  "iconFileId"}, "flags": [...]}\`. \`inGame.iconFileId\` is the \`displayIcon\` for an icon or bar. \`flags\` (e.g.
  \`not-in-game\`, \`name-mismatch\`, \`not-synced\`) mean "double-check in the game": tell the player. 404 when no
  source knows the ID.
- \`GET /api/forever/spells/status\` → whether the cache is synced; \`POST /api/forever/spells/sync\` refreshes it (slow, uses the
  internet; only when the player asks or the cache is empty).

\`\`\`sh
curl -s '${o}/api/forever/spells/search?q=arcane%20intellect'
curl -s ${o}/api/forever/spells/1459
\`\`\`

Spell IDs go into Aura (Modern) and \`aura2\` triggers as strings (\`"auraspellids": ["1459"]\`) and into the spell
cooldown trigger as a number (\`"spellName": 2136\`).
`;
}

function pushApi({ o, d }: Ctx): string {
  return `## Push API

A **workspace** is what an open page shows: top-level auras (displays and groups), all drawn at once on the game
screen, one selected. Workspace IDs are 1-64 of \`A-Z a-z 0-9 _ -\`.

### POST /api/forever/workspaces/<id>/aura

Body: \`{"aura": {...}}\` for one aura, \`{"aura": {...group...}, "children": [...]}\` for a group, or
\`{"code": "!WA:2!..."}\` (an import string, e.g. one the player gave you).

\`\`\`sh
curl -s -X POST ${o}/api/forever/workspaces/${d}/aura \\
  -H 'Content-Type: application/json' \\
  --data-binary @aura.json
\`\`\`

Answer (200): \`{"workspace", "revision", "updatedAt", "validation": {...}}\` (and the import string, which you don't
need). Errors: \`{"error": "..."}\` with 400 (malformed request), 413 (too large), 422 (the addon rejects the aura),
503 (the addon couldn't be loaded; retry). Bodies may be up to 32 MB. Add \`?validate=false\` to skip validation
(it takes seconds for very large auras); \`validation\` is then null. The answer's \`url\` is the page that follows
this workspace (\`?w=\`): if no page is open, hand it to the player and the pushed aura is waiting there.

Merge rules: the pushed aura, with a group's whole subtree, **replaces the top-level aura with the same \`uid\`,
else the same \`id\`**, keeping its place, or is added at the end; it becomes selected. So keep the \`id\` while you
iterate on an aura, and use a new \`id\` for another aura. Ids are unique across the workspace: a pushed child whose
\`id\` is taken elsewhere is renamed (\`Name 2\`), so push either the separate auras or a group holding them, not both
(or give the group's children their own ids). Items can't be deleted over the API; the player removes them.

### Reading the workspace

- \`GET /api/forever/workspaces/<id>\` → \`{"id", "code", "updatedAt", "revision", "source", "url"}\`: the top-level aura
  pushed or changed last, as an import string (\`code\` is null until something was pushed or changed since the
  server started). The page reports every top-level aura the player changes, so read this to see their edits.
  \`?revision=<n>\` gives one of the last few revisions instead (404 once it is no longer kept).
- \`GET /api/forever/workspaces/<id>/events\` → Server-Sent Events: \`event: snapshot\` on connect, then \`event: state\` on
  every change, each a notice \`{"id", "revision", "updatedAt", "source"}\` without the code (codes can be
  megabytes); fetch \`GET /api/forever/workspaces/<id>?revision=<n>\` for the code.

### The workspace file

The player can save and load the whole workspace as a \`.aura-workspace.json\` file; you may write one for them to
load (Import). It belongs to one game: \`"game": "forever"\`.

\`\`\`json
{"format": "aura-simulator/workspace", "version": 3, "game": "forever", "updatedAt": "2026-11-06T10:00:00.000Z",
 "selected": "Buffs",
 "items": [
   {"aura": {"id": "Buffs", "regionType": "group", "controlledChildren": ["Arcane Intellect"]},
    "items": [{"aura": {"id": "Arcane Intellect", "parent": "Buffs", "regionType": "icon"}}]},
   {"aura": {"id": "Cooldown", "regionType": "icon"}}
 ]}
\`\`\`

\`items\` is present exactly for groups and nests further; \`controlledChildren\` and \`parent\` follow the nesting.

### In the browser tab: \`window.auraSimulator\`

If you drive the player's page in a browser tab (browser automation, a devtools console), use its in-page command
instead of clicking through forms. It exists once the page has restored its workspace (wait for it):

- \`auraSimulator.load(input)\` takes what a push takes: \`{aura, children?}\`, \`{code}\`, or an import string. It
  merges like a push (same \`uid\`, else \`id\`, replaces; otherwise added), selects it, and the window, browser
  storage and server follow. Returns \`{ok: true, id, code}\` or \`{ok: false, error}\` (nothing changed).
- \`auraSimulator.code(id?)\`: the import string of an aura (a group's holds everything in it); the selected one by
  default. \`auraSimulator.state(id?)\`: its \`{aura, children}\`, what \`load\` takes. \`auraSimulator.workspaceId\`.

\`\`\`js
await page.waitForFunction(() => window.auraSimulator);
const r = await page.evaluate((aura) => window.auraSimulator.load({ aura }), myAura);
\`\`\`

The answer has no validation: read the window's Combat check, or push over HTTP to get \`validation\`.

### Handing the player a \`.txt\` file

Without a running app to push to, hand over the aura as a file the player drops on the page (or opens and pastes into
the game's Import box):

- An **aura file** holds exactly one import string (\`!WA:2!...\`): UTF-8, no quotes, no JSON, nothing before or after
  it (a final newline is fine). Name it after the aura, e.g. \`Arcane Intellect.txt\`. The app also reads several
  import strings in one text file (one per line), but the game's Import box takes one.
- Only the addon's encoder makes an import string; never write or edit one by hand. Take it from the push answer's
  \`code\` (\`?validate=false\` on a scratch workspace id if you only want the string), from \`auraSimulator.code()\`, or
  from the player.
- With no import string at all, write a workspace file (above) holding the aura document instead: the player imports
  it and exports the import string from the window.
`;
}

function workedExamples(): string {
  return `## Worked examples

The v1 auras, each a complete push body (the tests push these exact blocks and check the status). Buff reminder
1a (or its alternative) + 1b, cooldown icon 2, debuff bar 3, and group 4 holding them. Change ids, spell IDs (\`auraspellids\`,
\`spellName\`) and \`displayIcon\` for other spells.

${[...WORKED_EXAMPLES, COUNTER_EXAMPLE].map(exampleBlock).join("\n\n")}
`;
}

function troubleshooting(): string {
  return `## Troubleshooting

- **422 "Not a valid…" / the addon rejects it**: the JSON isn't a valid aura table (check number keys like \`"[1]"\`,
  arrays without holes, no nulls).
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
