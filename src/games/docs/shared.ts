/**
 * Agent-doc sections that are the same concept in every game, so each game's docs (`src/games/<game>/docs/`) use them
 * with its own id: wago JSON (wago.io's rules don't depend on the game), the push API, the workspace file and the page
 * command (the app's own, per game only by URL), the situation (the same model in every game; the game says what its
 * triggers and combat mean), the spell API (the app's own) and wago links. Everything about an addon (its triggers,
 * rules, defaults, examples) stays in the game's own docs.
 */
import type { AddonGameId } from "@/core";

/** JSON with 2-space indents, but anything that fits on one line (up to `width` columns) stays on one line. */
export function compactJson(value: unknown, width = 110, indent = ""): string {
  const flat = JSON.stringify(value);
  if (flat === undefined || value === null || typeof value !== "object" || indent.length + flat.length <= width) return flat;
  const inner = indent + "  ";
  if (Array.isArray(value)) return `[\n${value.map((v) => inner + compactJson(v, width, inner)).join(",\n")}\n${indent}]`;
  const entries = Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${compactJson(v, width, inner)}`);
  return `{\n${entries.join(",\n")}\n${indent}}`;
}

export interface WagoJsonSection {
  /** A minimal aura of the game as wago JSON. */
  minimal: unknown;
  /** The docs have a Groups section below (Forever's field reference). */
  groupsBelow: boolean;
  /** The docs list the addon's defaults below. */
  defaultsBelow: boolean;
}

/** How to write an aura as wago JSON (wago.io's rules, `.scratch/tbc-anniversary/wago-json.md`). */
export function wagoJsonSection({ minimal, groupsBelow, defaultsBelow }: WagoJsonSection): string {
  return `## wago JSON: how to write an aura

**Write auras as wago JSON.** It is the JSON wago.io shows for an aura (its Editor's "Table data"): the addon's
transmit table, with the aura in \`d\`. It is a full form of the aura, equal to its import string: the player can
import it, the app converts it both ways by wago's own rules, and the window's **JSON** tab shows every aura this way.

\`\`\`json
${compactJson(minimal)}
\`\`\`

- \`d\` is the aura: the Lua table the addon stores for it. \`c\` (only for a group) is an array of every descendant,
  flattened in the addon's order${groupsBelow ? " (see Groups below)" : " (each group, then its children, depth first)"}; leave it out for a single aura.
- \`m\` is always \`"d"\`. \`s\` (the addon version that made it), \`v\` (1421, or 2000 with nested groups) and wago's
  \`wagoID\` may be there; you can leave them out.
- Lua tables are JSON objects with string keys, or arrays for sequences 1..n. An empty table is \`[]\` (or \`{}\`).
  \`null\` in an array is a hole. Lua has no null: leave a field out instead.
- **Number keys are strings** in JSON: trigger N is \`"N"\` in \`triggers\`
  (\`{"1": {...}, "activeTriggerMode": -10}\`). They become number keys again only where wago restores them:
  \`triggers\`, a trigger's \`form.multi\`, \`talent.multi\`, \`specId.multi\`, \`herotalent.multi\`,
  \`actualSpec\` and \`arena_spec\`, and \`load.{talent,talent2,talent3,herotalent,instance_type,class_and_spec}.multi\`.
  Everywhere else \`"1"\` stays the string "1", so write sequences there as arrays (\`conditions\`, \`changes\`,
  \`subRegions\`, \`auraspellids\`, colours).
- Numbers are taken as written. Colours are \`[r, g, b, a]\` from 0 to 1.
- Leave out what you don't need: the addon fills defaults${defaultsBelow ? " (listed below)" : ""} on import, as the game does.
- \`id\` is the aura's name and must be unique in the workspace.
- The app writes wago JSON with keys sorted and 2-space indents, byte for byte as wago.io does; any key order and
  layout (compact on one line, or pretty) reads the same.
`;
}

export interface PushApiSection {
  game: AddonGameId;
  origin: string;
  /** The default workspace id. */
  workspace: string;
  /** The window's validation section, where the page shows the addon's checks ("Combat check"). */
  checkName: string;
}

/**
 * The push API (with what a push answers, `preview` included), reading the workspace, the workspace file, driving the
 * page (`window.auraSimulator`) and handing over files.
 */
export function pushApiSection({ game, origin: o, workspace: d, checkName }: PushApiSection): string {
  return `## Push API

A **workspace** is what an open page shows: top-level auras (displays and groups), all drawn at once on the game
screen, one selected. Workspace IDs are 1-64 of \`A-Z a-z 0-9 _ -\`. Everything below is plain HTTP: you never need
a browser to build, check and hand over an aura.

### POST /api/${game}/workspaces/<id>/aura

Body, one of:

- **wago JSON** (\`{"d": {...}, "c": [...]}\`), pretty or compact: the usual way.
- \`{"code": "!WA:2!..."}\` or a bare import string as text (e.g. one the player gave you).
- A wago link: \`{"wago": "https://wago.io/<id>"}\` or the bare link as text (see Wago links).
- \`{"aura": {...}}\` for one aura or \`{"aura": {...group...}, "children": [...]}\` for a group, in the aura
  document form.

\`\`\`sh
curl -s -X POST ${o}/api/${game}/workspaces/${d}/aura \\
  -H 'Content-Type: application/json' \\
  --data-binary @aura.json
\`\`\`

Every form gets the same answer and the same validation: the server turns it into the import string first (wago JSON
by wago's rules, a wago link by fetching it), and the addon's own import checks that.

Answer (200):

\`\`\`json
{"workspace": "${d}", "url": "${o}/${game}?w=${d}", "revision": 3, "updatedAt": "2026-11-06T10:00:00.000Z",
 "code": "!WA:2!...", "validation": {"errors": [], "warnings": []},
 "preview": {"situation": {...}, "displays": [{"id": "Arcane Intellect", "shown": true, ...}]}}
\`\`\`

- \`code\`: the aura's **import string**, made by the addon's own encoder: the text the player pastes into the game's
  Import box. Save it as the aura file (see Handing the player a file).
- \`validation\`: the addon's own checks (see Validation). Add \`?validate=false\` to skip them (they take seconds for
  very large auras); it is then null.
- \`preview\`: what each display shows in the workspace's situation (see Situation): read it to check that the aura
  does what was asked without a browser.
- \`url\`: the page that follows this workspace (\`?w=\`): if no page is open, hand it to the player and the pushed
  aura is waiting there.

Errors: \`{"error": "..."}\` with 400 (malformed request), 413 (too large), 422 (wago's rules or the addon reject the
aura), 404/502 (a wago link wago doesn't have or didn't answer), 503 (the addon couldn't be loaded; retry). Bodies may
be up to 32 MB.

Merge rules: the pushed aura, with a group's whole subtree, **replaces the top-level aura with the same \`uid\`,
else the same \`id\`**, keeping its place, or is added at the end; it becomes selected. So keep the \`id\` while you
iterate on an aura, and use a new \`id\` for another aura. Ids are unique across the workspace: a pushed child whose
\`id\` is taken elsewhere is renamed (\`Name 2\`), so push either the separate auras or a group holding them, not both
(or give the group's children their own ids). Items can't be deleted over the API; the player removes them.

### Reading the workspace

- \`GET /api/${game}/workspaces/<id>\` → \`{"id", "code", "updatedAt", "revision", "source", "url"}\`: the top-level aura
  pushed or changed last, as an import string (\`code\` is null until something was pushed or changed since the
  server started). The page reports every top-level aura the player changes, so read this to see their edits.
  \`?revision=<n>\` gives one of the last few revisions instead (404 once it is no longer kept).
- \`GET /api/${game}/workspaces/<id>/events\` → Server-Sent Events: \`event: snapshot\` on connect, then \`event: state\` on
  every change, each a notice \`{"id", "revision", "updatedAt", "source"}\` without the code (codes can be
  megabytes); fetch \`GET /api/${game}/workspaces/<id>?revision=<n>\` for the code. \`event: situation\` carries the
  situation an agent set (on connect, when one is set, and on every change).

### The workspace file

The player can save and load the whole workspace as a \`.aura-workspace.json\` file; you may write one for them to
load (Import). It belongs to one game: \`"game": "${game}"\`.

\`\`\`json
{"format": "aura-simulator/workspace", "version": 3, "game": "${game}", "updatedAt": "2026-11-06T10:00:00.000Z",
 "selected": "Buffs",
 "items": [
   {"aura": {"id": "Buffs", "regionType": "group", "controlledChildren": ["Arcane Intellect"]},
    "items": [{"aura": {"id": "Arcane Intellect", "parent": "Buffs", "regionType": "icon"}}]},
   {"aura": {"id": "Cooldown", "regionType": "icon"}}
 ]}
\`\`\`

\`items\` is present exactly for groups and nests further; \`controlledChildren\` and \`parent\` follow the nesting.

### Driving the page in a browser: \`window.auraSimulator\`

You don't need a browser: push, set the situation and read \`preview\` over HTTP (above and in Situation). If you
do drive the player's page (e.g. with Playwright, or a devtools console), use its in-page command instead of clicking
through forms. It exists once the page has restored its workspace (wait for it):

- \`await auraSimulator.load(input)\` takes what a push takes except wago links: wago JSON (an object or its text),
  \`{aura, children?}\`, \`{code}\`, or an import string. It
  merges like a push (same \`uid\`, else \`id\`, replaces; otherwise added), selects it, and the window, browser
  storage and server follow. Resolves to \`{ok: true, id, code}\` or \`{ok: false, error}\` (nothing changed; e.g. the
  addon's import refuses an aura made with a newer version).
- \`auraSimulator.code(id?)\`: the import string of an aura (a group's holds everything in it); the selected one by
  default. \`auraSimulator.state(id?)\`: its \`{aura, children}\`, what \`load\` takes. \`auraSimulator.workspaceId\`.
- \`auraSimulator.situation(situation?)\`: sets the game screen's situation (a whole situation, as Situation describes;
  left-out parts are the defaults) and answers \`{ok: true, situation}\`, or \`{ok: false, error}\` for one that isn't;
  without an argument it only reads it.
- \`auraSimulator.preview(id?)\`: what each display of an aura (the selected one by default) shows in the page's
  situation, as a push's \`preview\`.

\`\`\`js
await page.goto("${o}/${game}?w=${d}");
await page.waitForFunction(() => window.auraSimulator);
const r = await page.evaluate((aura) => window.auraSimulator.load(aura), myWagoJson);
await page.evaluate(() => window.auraSimulator.situation({triggers: {"1": {"present": false}}}));
await page.screenshot({path: "aura.png"});
\`\`\`

The answer has no validation: read the window's ${checkName}, or push over HTTP to get \`validation\`.

### Handing the player a file

Without a running app to push to, hand over the aura as a file the player drops on the page (or opens and pastes into
the game's Import box). The page reads a **wago JSON file** (\`Arcane Intellect.json\`, the aura as above) like an
import string; this is what you can write yourself. For the game itself the player needs the import string: they
import the \`.json\` in the window and export it from there.

- An **aura file** holds exactly one import string (\`!WA:2!...\`): UTF-8, no quotes, no JSON, nothing before or after
  it (a final newline is fine). Name it after the aura, e.g. \`Arcane Intellect.txt\`. The app also reads several
  import strings in one text file (one per line), but the game's Import box takes one.
- Only the addon's encoder makes an import string; never write or edit one by hand. Take it from the push answer's
  \`code\` field (\`?validate=false\` on a scratch workspace id if you only want the string), from
  \`auraSimulator.code()\`, or from the player.
- With no import string at all, write a workspace file (above) holding the aura document instead: the player imports
  it and exports the import string from the window.
`;
}

export interface SituationSection {
  game: AddonGameId;
  origin: string;
  /** The default workspace id. */
  workspace: string;
  /** What the trigger's situation means per trigger kind, as Markdown list items (the game's trigger kinds). */
  kinds: string;
  /** What being in combat does in this game (Markdown). */
  combat: string;
  /** A situation that shows the game's minimal example working, and what it shows (one sentence). */
  example: { situation: unknown; shows: string };
}

/**
 * The situation: the page's Situation panel, setting it over HTTP and in the page, and `preview`. The model is the
 * same in every game (`src/core/situation`); what its triggers mean and what combat does are the game's words.
 */
export function situationSection({ game, origin: o, workspace: d, kinds, combat, example }: SituationSection): string {
  return `## Situation: show that an aura works

The game screen draws the auras in a simulated **situation**: per trigger, whether its aura is there and how long it
has left, plus a target and combat. The page's **Situation** panel (under the aura list) sets it for the selected
aura:

- **Target exists** and **In combat** switches.
- Per trigger ("Trigger 1: Aura", …): **Aura present** (for a cooldown trigger: On cooldown), **Time left** (a
  slider), **Duration** (seconds) and **Stacks** (a cooldown's charges).

${kinds}

${combat}

### Setting it over HTTP

\`PUT /api/${game}/workspaces/<id>/situation\` with a situation as JSON. Open pages' game screens switch to it (the
player can still change it there), and every later push to the workspace answers with its \`preview\` in it. The
answer is \`GET /api/${game}/workspaces/<id>/situation\`'s: \`{"workspace", "situation", "set", "preview"}\`, where
\`preview\` is for the latest pushed aura (null before a push) and \`set\` says whether an agent set it.

\`\`\`json
{"targetExists": true, "inCombat": false,
 "triggers": {"1": {"present": true, "remaining": 25, "duration": 3600, "stacks": 0}}}
\`\`\`

- It is a **whole situation**: what you leave out has its default. Default: target exists, not in combat, and every
  trigger \`{"present": true, "remaining": 45, "duration": 60, "stacks": 0}\`. A trigger's left-out fields have
  those defaults too.
- \`triggers\` is keyed by the trigger number (\`"1"\`, \`"2"\`, as in the aura). \`remaining\` and \`duration\` are
  seconds (\`remaining\` is kept within \`duration\`; \`duration: 0\` means no timer, e.g. a permanent buff);
  \`stacks\` is a whole number. 400 with a message for anything else.

\`\`\`sh
curl -s -X PUT ${o}/api/${game}/workspaces/${d}/situation \\
  -H 'Content-Type: application/json' \\
  --data-binary '${JSON.stringify(example.situation)}'
\`\`\`

${example.shows}

### Reading \`preview\`

\`preview\` (push answers, the situation's answer, \`auraSimulator.preview()\`) has the \`situation\` it was evaluated in
and per display (a group's children each, not the group):

- \`shown\`: the display is drawn.
- \`triggers\`: \`[{"trigger", "active", "remaining"?, "duration", "stacks"}]\`: what each trigger reports.
- \`activeConditions\`: numbers (from 1) of the conditions whose check holds (conditions only run while shown).
- \`changed\`: what those conditions changed, \`{"desaturate": true, "sub.3.glow": true, ...}\`.
- \`glows\`: \`[{"subRegion", "lit"}]\`: each glow sub-element by its place in \`subRegions\`, lit or not.

To show that an aura works, push it, then set each situation the request names (the buff missing, under 3 minutes
left, the target gone, …) and check \`shown\`, \`changed\` and \`glows\`. The player sees the same on the open page.
`;
}

export interface SpellApiSection {
  game: AddonGameId;
  origin: string;
  /** The game's words for its spells ("Forever's", "TBC Anniversary's"). */
  whose: string;
  /** A spell to show: a name to search and its ID. */
  example: { name: string; id: number };
}

/** The spell API (search, lookup, the response fields), the app's own and the same in every game. */
export function spellApiSection({ game, origin: o, whose, example }: SpellApiSection): string {
  return `- \`GET /api/${game}/spells/search?q=<name or ID>&limit=<1-100>\` → \`{"query", "build", "limit", "total",
  "results": [{"id", "name", "icon", "iconUrl"}]}\`. It searches ${whose} **spell names** (every word must occur; a
  number also matches the ID), best matches first. At most \`limit\` results (**20 by default, at most 100**);
  \`total\` is how many spells match, so when it is more than \`results\` has, raise \`limit\` or narrow the query.
  Names only: tooltips aren't searched (they come from Wowhead one spell at a time), so search for the buff's or
  item's name, then read candidates' \`tooltip\`/\`buff\` with the lookup below.
- \`GET /api/${game}/spells/<id>\` → one spell (404 with the same fields when no source knows the ID):
  - \`id\`, \`found\` (the game or Wowhead knows it), \`name\`, \`icon\` (file name), \`iconUrl\` (an image of it).
  - \`tooltip\`: Wowhead's tooltip for the spell (HTML: what it does); \`buff\`: Wowhead's tooltip of the aura it
    leaves (HTML: the text the buff or debuff shows in game). Null until fetched (the first
    lookup fetches them) or when Wowhead has none.
  - \`inGame\`: the game's own data for the synced build, \`{"name", "icon", "iconFileId"}\`, or null when the build
    doesn't have the ID. \`inGame.iconFileId\` is the \`displayIcon\` for an icon or bar.
  - \`wowhead\`: \`{"status", "name", "icon"}\`; \`status\` is \`found\`, \`not_found\`, \`unavailable\` (Wowhead didn't
    answer; retried next time) or \`not_fetched\`.
  - \`source\`: where \`name\`, \`icon\` and \`tooltip\` came from (\`wago\`: the game's data; \`wowhead\`).
  - \`flags\`, empty when everything agrees; otherwise tell the player to double-check in the game:
    \`not-synced\` (the spell list was never synced), \`not-in-game\` (Wowhead knows it, the game's list doesn't),
    \`not-on-wowhead\`, \`wowhead-unavailable\`, \`name-mismatch\` and \`icon-mismatch\` (the game and Wowhead
    disagree), \`no-icon\`, \`unknown\` (nobody knows the ID).

\`\`\`sh
curl -s '${o}/api/${game}/spells/search?q=${encodeURIComponent(example.name)}'
curl -s ${o}/api/${game}/spells/${example.id}
\`\`\``;
}

/** Loading an aura from wago.io by its link. */
export function wagoLinksSection({ game, origin: o, workspace: d }: Omit<PushApiSection, "checkName">): string {
  return `## Wago links

An aura on wago.io can be loaded by its link, e.g. \`https://wago.io/LEPRolmHn\`: the server fetches its import
string from wago's data API (the latest version) and imports it like any other. Links to one version
(\`https://wago.io/<id>/<n>\`) aren't supported.

- Push it: body \`{"wago": "https://wago.io/<id>"}\` (or the bare id), or the link as plain text. The answer is the
  push answer above.
- The player can paste a link (or a bare wago id) into the window's Import box.
- \`GET /api/${game}/wago/<id>\` → \`{"id", "code"}\`: just the import string. 400 for an id that isn't one
  (letters, digits, \`-\` and \`_\`), 404 when wago has no such aura, 502 when wago fails.

\`\`\`sh
curl -s -X POST ${o}/api/${game}/workspaces/${d}/aura --data-binary 'https://wago.io/LEPRolmHn'
\`\`\`

Whether the addon takes it is the addon's call, as in the game: an aura made for another game or a newer version
may be refused (422) or changed on import.
`;
}
