/**
 * Agent-doc sections that are the same concept in every game, so each game's docs (`src/games/<game>/docs/`) use them
 * with its own id: wago JSON (wago.io's rules don't depend on the game), the push API, the workspace file and the page
 * command (the app's own, per game only by URL), the situation (the same model in every game; the game says what its
 * triggers and combat mean), the spell API (the app's own), wago links and pictures of an aura (the app's own; UI units
 * are every WoW client's). Everything about an addon (its triggers, rules, defaults, examples) stays in the game's own
 * docs.
 */
import type { AddonGameId } from "@/core";
import { MAX_RENDER_PADDING, MAX_RENDER_PIXELS, MAX_RENDER_SCALE } from "@/workspace";

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

### Deleting a workspace

\`DELETE /api/${game}/workspaces/<id>\` → \`{"workspace", "deleted"}\`: the server forgets the workspace (its pushes and
its situation; \`deleted: false\` when it kept nothing for it). Delete scratch workspaces you made to try things.
Pages that have it open keep their own copy in the browser, and a later push starts it again.

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
- Per trigger ("Trigger 1: Aura", …): **Aura present** (for a cooldown trigger: On cooldown; Item Count: In bags;
  Weapon Enchant: Enchanted; other triggers: Present), **Time left** (a slider), **Duration** (seconds) and
  **Stacks** (a spell cooldown's or enchant's charges, an Item Count's Count).
- **Only this aura**: the triggers it edits are the selected aura's own (its override, below), not the
  workspace-wide ones every other aura sees.

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
- **Per aura**: trigger numbers are per aura, so the workspace-wide \`triggers\` are what every aura sees. \`auras\`
  overrides them for single auras, by aura \`id\`: \`{"<aura id>": {"triggers": {"1": {...}}}}\`. An override's
  left-out fields come from the workspace-wide trigger; target and combat stay workspace-wide. Four item count icons
  showing 8, 5, 1 and 12 side by side:
  \`{"triggers": {"1": {"stacks": 12}}, "auras": {"Food": {"triggers": {"1": {"stacks": 8}}}, "Flask": {"triggers": {"1": {"stacks": 5}}}, "Stone": {"triggers": {"1": {"stacks": 1}}}}}\`.

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
- \`texts\`: \`[{"subRegion", "text", "visible"}]\`: what each text sub-element draws, its format codes replaced
  (\`"%2.s"\` → \`"8"\`, an empty text → \`""\`), after conditions (a condition's \`sub.N.text_text\` is drawn). The game
  screen draws exactly this. A text display has \`displayText\` (\`{"text"}\`) too.
- Custom text (\`%c\`, \`%c2\`, …) comes from the aura's custom text function, which the simulator doesn't run: such
  a text has \`"customText": "not evaluated"\`, and \`[%c]\` stands in its \`text\` (the game screen draws it marked).
  Check custom text in game.
- **No custom Lua runs in the preview** (nor on the game screen). \`notEvaluated\`, present only when a display has
  custom code, lists the parts: \`"trigger 2: custom (stateupdate)"\` (a custom trigger, TSU included, is active while
  its situation says "present", like any trigger), \`"condition 1: custom check"\` (a custom check never holds here),
  \`"condition 2: Run Custom Code"\`, \`"custom text (%c)"\`, \`"On Init custom code"\`/On Load/On Unload/On Show/On
  Hide, \`"start animation: custom function"\`, \`"custom trigger logic"\`, \`"custom anchor"\`, chat messages' custom
  text, a dynamic group's \`"custom grow"\`/\`"custom sort"\` (the places the addon's import dialog lists as custom Lua;
  validation has a \`custom.lua\` info for each, with its pointer). The game screen marks such a display with a dashed **Lua** badge (hover
  lists the parts; pictures from the screenshot endpoint leave it out, as the game would). Its preview shows only
  what the plain options do; check those parts in game.

To show that an aura works, push it, then set each situation the request names (the buff missing, under 3 minutes
left, the target gone, …) and check \`shown\`, \`changed\`, \`glows\` and \`texts\`. The player sees the same on the open
page. The answer's \`preview\` is for the latest pushed aura, each display in its own situation (with its \`auras\`
override).
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

export interface DisplayMediaNotes {
  game: AddonGameId;
  origin: string;
  /** The addon version the option reference links name. */
  ref: string;
}

/**
 * How displays take icons, textures and media, how a border's offset draws, and where a dynamic group's layout keys
 * are: the same in every game's addon (SubRegionTypes/Border.lua, RegionPrototype.lua AnchorSubRegion).
 */
export function displayMediaNotes({ game, origin: o, ref }: DisplayMediaNotes): string {
  const part = (name: string) => `\`GET ${o}/${game}/docs/agents/options/${name}.md?ref=${encodeURIComponent(ref)}\``;
  return `### Icons, textures, fonts and borders

- **Icons** (\`displayIcon\`, a bar's icon): a FileDataID (\`134042\`; a spell's \`inGame.iconFileId\`, an item's
  \`iconFileId\`) or an icon path, \`"Interface\\\\Icons\\\\INV_Misc_Food_86_Basilisk"\` (any case). Find either with the
  icon search (see Items, icons and media). The automatic icon (\`iconSource\` -1) is the trigger's own.
- **Textures** (a texture display's \`texture\`, a sub element's \`textureTexture\`, progress textures, …): a FileDataID,
  any game path (\`"Interface\\\\Cursor\\\\Cast"\`, \`"Interface\\\\Icons\\\\NAME"\`) or one of the addon's own files
  (\`"Interface\\\\AddOns\\\\WeakAuras\\\\Media\\\\Textures\\\\Square_White"\`). A path the game doesn't have draws nothing
  in game: the push answer has a \`media.texture\` info and the game screen shows a magenta checkerboard there.
- **Fonts, bar textures, borders** are LibSharedMedia names (\`text_font: "Arial Narrow"\`), only those of
  \`GET /api/${game}/media\`. Any other name (one from SharedMedia or ElvUI) works only for players who have that
  addon; the game draws the default instead, and validation warns (\`media.font\`, …).
- **Border** (\`subborder\`): the border's frame is the display (on bars the \`anchor_area\`) grown by \`border_offset\`
  pixels on every side, and its edge (\`border_edge\`, default \`"Square Full White"\`) is drawn \`border_size\` pixels
  thick **inside** that frame. So \`border_offset: 0\` covers the display's outer \`border_size\` pixels, and
  \`border_offset\` equal to \`border_size\` puts the whole border just outside the display. In a screenshot: an icon
  whose art is inset by the border's thickness has it inside (offset 0); art filling the box inside the border, outside.
- **Dynamic groups** (\`dynamicgroup\`): \`grow\`, \`align\`, \`space\`, \`stagger\`, \`sort\`, \`limit\`, \`radius\` and the grid
  keys are set on the **Group** tab, not Display: the option reference's Group part (${part("group")}) has
  them all with their values and defaults. A group's Display tab (${part("region-dynamicgroup")}) edits its
  children's tables (\`children:\` in the reference), not the group's. \`space\` is the distance between the children's
  edges (their \`width\`/\`height\`), not between borders drawn outside them. \`grow\` also sets \`selfPoint\` (the
  reference lists what each Grow choice writes): write both.
`;
}

/**
 * The Item Count trigger at zero items, as both addons have it (Prototypes.lua "Item Count": no count test unless
 * `use_count`; dynamic_texts.s: "" for 0 stacks; WeakAuras.lua ValueForSymbol: `%N.stacks` is the state's value).
 */
export function itemCountNotes(): string {
  return `### Item Count (\`"type": "item"\`, \`"event": "Item Count"\`) at zero

\`itemName\` is the item's ID (or name). The trigger's stacks (\`%s\`, \`%N.s\` for trigger N) is the count in your bags
(\`use_includeBank\`, \`use_includeCharges\` to count more).

- **Active at 0**: without a count test the trigger is active whatever the count, 0 included, so the aura shows with
  no items. To hide it at 0, add the Item Count test: \`use_count: true\`, \`count_operator\` \`">"\`, \`count\` \`"0"\` (a
  string); or keep it shown and dim or desaturate it with a condition on Stacks (\`stacks\` \`==\` 0).
- **The text at 0**: \`%s\` and \`%2.s\` draw **nothing** at 0 (the addon's \`s\` text is empty for 0 stacks), so a
  stack text vanishes when the bags are empty. \`%2.stacks\` (the trigger's own \`stacks\` value) draws \`"0"\`.
- In a situation, \`{"triggers": {"2": {"stacks": 0}}}\` shows it at 0.
`;
}

export interface GameDataSection {
  game: AddonGameId;
  origin: string;
  /** The game's words ("Forever's", "TBC Anniversary's"). */
  whose: string;
  /** An item to show: a name to search and its ID. */
  item: { name: string; id: number };
  /** Words of an icon name to search. */
  icon: string;
}

/** The item, icon, game file and media APIs (the app's own, the same in every game). */
export function gameDataSection({ game, origin: o, whose, item, icon }: GameDataSection): string {
  return `## Items, icons and media

${whose} items and game files come from wago.tools (the game's own client data for its latest build), downloaded by
the server on first use.

### Items

- \`GET /api/${game}/items/search?q=<name or ID>&icon=<icon>&offset=<0…>&limit=<1-100>\` → \`{"query", "icon", "build",
  "offset", "limit", "total", "results"}\`, best matches first (every word must occur; a number also matches the ID;
  20 results by default, at most 100). Page with \`offset\` (add \`limit\` while \`offset\` < \`total\`).
- **Items by icon:** \`icon\` is a FileDataID, an \`Interface\\Icons\\\` path or an icon name (\`INV_Potion_72\`); alone it
  lists every item with that icon, with \`q\` the matching ones. The answer's \`icon\` is the icon it resolved to
  (\`{"id", "name", "path", "iconUrl"}\`); 404 when the game has no such icon.
- \`GET /api/${game}/items/<id>\` → one item; 404 when the game has none.
- An item: \`id\`, \`name\`, \`quality\` (0 Poor … 7 Heirloom) and \`qualityName\`, \`itemLevel\`, \`classId\`/\`subclassId\`,
  \`iconFileId\` (a FileDataID: what \`displayIcon\` takes), \`icon\` (name), \`iconPath\` (\`Interface\\Icons\\NAME\`),
  \`iconUrl\` (an image), \`wowhead\` (the item on Wowhead in the game's database).

### Icons

- \`GET /api/${game}/icons/search?q=<words of the name, or a path>&offset=<0…>&limit=<1-100>\` → \`{"query", "build",
  "offset", "limit", "total", "results": [{"id", "name", "path", "iconUrl"}]}\`: the game's icons (\`Interface\\Icons\\\`)
  by name. \`id\` (FileDataID) and \`path\` both work as \`displayIcon\` or as a texture. Icon names are words joined by
  \`_\` (\`INV_Misc_Food_86_Basilisk\`): search for some of them (\`food basilisk\`). More than \`limit\` match: page
  with \`offset\` up to \`total\` ("potion" has well over 100).
- **Icons that look like a crop:** \`POST /api/${game}/icons/similar?q=<optional name filter>&colour=auto|colour|grey&offset=&limit=\`
  with the screenshot's icon cropped out as the body (PNG, JPEG or WebP, up to 8 MB; or a multipart form's \`image\`).
  It compares the crop with the game's icon files and answers \`{"status": "ok", "mode", "saturation", "total",
  "closeToBest", "unavailable", "results": [{"id", "name", "path", "iconUrl", "distance", "zoom", "uploadInset"}]}\`,
  best first: \`distance\` 0-1 (lower is closer), \`zoom\` the icon \`zoom\` it matched at (write it to the aura), and
  \`uploadInset\` how much of the crop's edge it ignored (a border or background around the icon).
  - \`colour=grey\` compares brightness only, for a **desaturated** icon in the screenshot (an icon on cooldown,
    \`desaturate\`); \`auto\` (the default) picks grey when the crop has almost no colour (\`mode\` says which).
  - **Icons of one family can differ only in colour** (the same potion in red, blue and green): in grey mode they tie.
    \`closeToBest\` counts the icons about as close as the best; above 1, check those candidates' \`iconUrl\` and pick by
    what the aura is for (the spell or item it tracks).
  - Without \`q\` it compares every icon, which needs the server's index of icon pictures: the first time it answers
    202 \`{"status": "indexing", "indexed", "total", "retryAfter"}\` while it builds (a few minutes, once). Retry, or pass
    \`q\` (a word of the name: \`potion\`) to compare just those now (up to 300 not yet indexed).

### Game files

- \`GET /api/${game}/files?path=<path>&path=…&ids=<FileDataID,…>\` (up to 200 of each) → \`{"build", "paths": {"<path
  as given>": {"id", "path"} | null}, "ids": {…}}\`: whether the game has a file (any case, \`/\` or \`\\\`, with or
  without \`.blp\`/\`.tga\`) and its FileDataID. Every file under \`Interface\\\` is listed.

### Fonts, bar textures, borders and backgrounds

- \`GET /api/${game}/media\` → \`{"ref", "types": {"font" | "statusbar" | "border" | "background" | "sound": {"default",
  "entries": [{"name", "file", "from"}]}}, "fontSamples"}\`: the names a stock client with the addon has (the game's own,
  \`from: "game"\`, and the addon's, \`from: "addon"\`), as the window's lists show them. Only these work for every
  player. Several common names are not among them: ElvUI's and SharedMedia's ("PT Sans Narrow", "Expressway",
  "1 Pixel"); the addon's own may be close (\`"PT Sans Narrow Regular"\`, \`"PT Sans Narrow Bold"\`).

**Identifying a font from a screenshot.** Open \`fontSamples\` (\`${o}/${game}/fonts?text=<the text in the
screenshot>&size=<its height in px>&outline=<OUTLINE|THICKOUTLINE|None>\`) in a browser or a screenshot tool: every
font of the list draws your text in the game's own font files, side by side. Compare the digits and a few letters
(\`1\`, \`4\`, \`a\`, \`g\`, \`R\`), the width (narrow: Arial Narrow, PT Sans Narrow; wide: Friz Quadrata TT, the game's
default) and serifs (Morpheus, Skurri, Nimrod MT). When the screenshot's font isn't in the list (ElvUI's Expressway,
a SharedMedia font), pick the closest listed font and tell the player which one you used and why.

\`\`\`sh
curl -s '${o}/api/${game}/items/search?q=${encodeURIComponent(item.name)}'
curl -s ${o}/api/${game}/items/${item.id}
curl -s '${o}/api/${game}/icons/search?q=${encodeURIComponent(icon)}'
curl -s -X POST --data-binary @icon.png -H 'Content-Type: image/png' '${o}/api/${game}/icons/similar?q=potion'
curl -s '${o}/api/${game}/files?path=Interface%5CCursor%5CCast'
curl -s ${o}/api/${game}/media
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

export interface PicturesSection {
  game: AddonGameId;
  origin: string;
  /** The default workspace id. */
  workspace: string;
  /** The id of an aura of the game's examples, to name in the examples. */
  auraId: string;
}

/**
 * Pictures of an aura as the game draws it (the render page and the screenshot endpoint, the app's own), and how game
 * pixels relate to UI units (the same in every WoW client), for working from a player's screenshot.
 */
export function picturesSection({ game, origin: o, workspace: d, auraId }: PicturesSection): string {
  // Window heights / 768 at UI scale 1, and "pixel perfect".
  const commonScales = "1 (pixel perfect), 1.125, 1.40625 (1080 px high, UI scale off), 1.875 (1440 px), 2.8125 (2160 px)";
  const shot = `${o}/api/${game}/workspaces/${d}/screenshot.png?aura=${encodeURIComponent(auraId)}`;
  const low = encodeURIComponent(JSON.stringify({ triggers: { "1": { remaining: 5 } } }));
  return `## Pictures: working from a screenshot

When the player shows a screenshot of an aura ("make a WA that does this"), build it, then take a **picture** of
yours as the game draws it and compare the two. No browser is needed: the server takes the picture.

### The screenshot endpoint

\`GET /api/${game}/workspaces/<id>/screenshot.png\` → a PNG of an aura of the workspace's recent pushes, drawn as the
game screen draws it and nothing else: cropped to the aura's bounds, no selection outline, no window, transparent
around it. Query parameters (all optional):

- \`aura\`: the aura or group to draw, by \`id\` (a group's child too). Default: the latest push's top-level aura. The
  server keeps each workspace's last 8 pushes (each a top-level aura with everything in it) and draws the newest one
  that has the aura, so push before you take a picture. A child is drawn where its group puts it, with the rest of
  the group around it, and the picture is cropped to the child.
- \`scale\`: **game pixels per UI unit** (see below), above 0 up to ${MAX_RENDER_SCALE}. Default 1: a 64-unit icon is 64 px.
- \`padding\`: UI units of space around the bounds, 0 to ${MAX_RENDER_PADDING} (default 0). The bounds are the aura's
  regions (a group's: its shown children and its border); glows, outlines and shadows reaching outside them need
  padding (a button glow reaches about a fifth of the icon's size out).
- \`background\`: a hex colour (\`000000\`, \`#202020\`, \`00000080\`) to draw on; default transparent. Pick the colour
  behind the aura in the player's screenshot to compare like with like.
- \`situation\`: a situation as JSON (the body of \`PUT .../situation\`, see Situation), URL-encoded, e.g.
  \`{"triggers":{"1":{"remaining":5}}}\`. Default: the workspace's situation. Take one picture per state the
  screenshot shows (the buff up, running low, missing, …).
- \`ref\`: the addon version, as for pushes.

The picture is \`round((bounds + 2 × padding) × scale)\` pixels on each side, at most ${MAX_RENDER_PIXELS}. It is a still:
each aura as it looks one second after it appeared (start animations done, glows lit, animations stopped there). An
aura not shown in the situation draws nothing: the picture is transparent, the size of where it would be. The
\`X-Aura-Revision\` header names the push drawn. Errors are JSON \`{"error"}\`: 400 a bad parameter, 404 nothing pushed
to the workspace or no recent push has that aura, 503 the server can't run a headless browser (the message says how
to install one, e.g. \`npx playwright install chromium\`).

\`\`\`sh
curl -s -o aura.png '${shot}&scale=1.125&padding=12'
curl -s -o low.png '${shot}&situation=${low}'
\`\`\`

The same picture is a page: \`${o}/${game}/render?w=<id>\` with the same parameters shows only the aura on a
transparent page. Its \`[data-testid="aura-render"]\` element gets \`data-ready="true"\` once every texture, icon and
font has loaded, and \`data-width\`/\`data-height\` give its size in pixels. Open it to look at the picture, or to take
a screenshot of it yourself.

### Game pixels and UI units

Every size and offset of an aura (\`width\`, \`height\`, \`xOffset\`, \`yOffset\`, font sizes, border sizes) is in **UI
units**. WoW's UI is **768 units high** at UI scale 1, whatever the resolution; its width follows the window's aspect
ratio. The UI scale (the game's "UI Scale" option; 1 while "Use UI Scale" is off) scales every unit, so:

    game pixels per UI unit = window height in pixels / 768 × UI scale

- 1920 × 1080, UI scale off: 1080 / 768 = 1.40625 px per unit; a 64-unit icon is 90 px.
- 2560 × 1440, UI scale 0.60: 1440 / 768 × 0.6 = 1.125 px per unit; a 64-unit icon is 72 px.
- 1920 × 1080, UI scale 0.7111 (768 / 1080, "pixel perfect", as ElvUI sets it): 1 px per unit.

A group's \`scale\` multiplies everything in it. In game, \`/dump UIParent:GetEffectiveScale()\` prints the UI scale and
\`/dump GetScreenHeight()\` the UI's height in units (the window height in pixels divided by it is the pixels per
unit). The page's game screen uses the same model (its screen settings: resolution and UI scale); its "1:1" zoom is
one browser pixel per game pixel.

### Finding the scale: pixels per UI unit

A cropped screenshot of an aura rarely shows anything of known size (no action button, no full window), so the scale
has to come from the aura itself. Ask the player for their UI scale and window height when sizes must be exact (the
two \`/dump\`s above); otherwise infer it from the layout:

- **Sizes and spacing tend to be whole units.** Icons are usually 32, 36, 40, 48 or 64 units square, a dynamic
  group's \`space\` 0-10 units. Try scales \`s\` (a common one: ${commonScales}) and keep the one where every measured
  size, gap and pitch (from one icon's left edge to the next one's) divided by \`s\` is close to a whole number.
- **1-unit lines alternate between 1 and 2 px** at a fractional scale (1.40625 px per unit draws a 1-unit border 1 px
  on some edges and 2 px on others, as the game snaps each edge to a pixel). Average several edges, and don't read a
  1 px line as half a unit.
- **Font sizes are whole numbers** (\`text_fontSize\`): a line of capitals and digits is about 0.7 × the size high, so a
  9 px digit at 1.40625 px per unit is about size 9 / 0.7 / 1.40625 ≈ 9.
- **The absolute scale may be ambiguous**: 45 px is 32 units at 1.40625 px per unit and 40 units at 1.125. Several
  scales can fit equally well. What must match are the **proportions**: sizes, gaps, borders and fonts relative to
  each other. Pick the most likely scale, say which one you assumed, and ask the player for their UI scale when the
  absolute size matters (an aura that must fit next to their action bars).

The compare endpoint below finds the scale that lays your aura over the screenshot best, given your aura's sizes.

### Reading the layout from pixels

- **Border drawn inside or outside** (a \`subborder\` of \`border_size\` units): with \`border_offset\` 0 the border covers
  the display's outer \`border_size\` units, so the icon's art is **inset**: the art is smaller than the bordered box by
  2 × \`border_size\` on each axis, and the bordered box is the display's \`width\`. With \`border_offset\` equal to
  \`border_size\` the border lies just outside: the art fills the display and the bordered box is 2 × \`border_size\`
  larger. Measure the art (where the icon's picture starts) against the border's outer edge: an inset of the border's
  thickness means inside, no inset means outside.
- **A dynamic group's \`space\` is between the regions' edges** (each display's \`width\`/\`height\`), not between their
  borders: borders drawn outside (\`border_offset\` > 0) take \`border_offset\` from each side of the gap you see. So
  \`space\` = pitch − \`width\` (pitch: from one region's left edge to the next one's), and the empty gap between two
  outside borders is \`space\` − 2 × \`border_offset\`.
- **Icon \`zoom\` crops the art** (0 to 1, a fraction): the icon shows the middle \`1 − zoom / 2\` of the icon's art,
  enlarged to fill the display, so \`zoom\` / 4 of the art is cut from each side (0.3 cuts 7.5 %). Most icon files
  have a thin dark rim and some art up to their edges: when the screenshot's icon has no rim and its picture looks
  larger than the same icon in \`iconUrl\` (details cut at the edges), the aura is zoomed. Compare the screenshot's icon
  with the icon file at a few zooms; the similar-icon search (Items, icons and media) reports the zoom it matched at.
- **Text shadow or outline**: an outline (\`text_fontType\` \`"OUTLINE"\` or \`"THICKOUTLINE"\` on a sub element; a text
  display's \`outline\`) is a dark rim **all around** each glyph, as thick on the top left as on the bottom right. A
  drop shadow is a dark copy of the glyph **offset to one side** (usually down and right), with no rim on the other
  sides. A shadow is \`text_shadowColor\` (\`[r, g, b, a]\`) moved \`text_shadowXOffset\` units right and
  \`text_shadowYOffset\` units up (negative: down) on a sub element; \`shadowColor\`, \`shadowXOffset\`, \`shadowYOffset\` on
  a text display. Offsets 0 (a sub element's default) draw no visible shadow; a shadow with \`text_fontType\` \`"None"\`
  is the usual shadow-only look (\`1\`, \`-1\`: one unit right and down). Both together are possible.

### Sizes and offsets from the player's screenshot

1. **Find the screenshot's pixels per unit** (above). A screenshot the game saved (Print Screen, in its Screenshots
   folder) is at the window's resolution: its height is the window height. A screenshot the operating system took
   may be scaled by its display scaling (e.g. 2× on a Retina Mac): compare the image's size with the window's.
2. **Measure in pixels and divide by the pixels per unit**: a 72 px icon at 1.125 px per unit is 64 units. Round to
   whole units. Text: a font's size is its height in units, roughly the line's height; its capitals are about
   0.7 × that.
3. **Offsets**: \`xOffset\`/\`yOffset\` go from the anchor frame's \`anchorPoint\` (the screen's centre for \`CENTER\` on
   the screen) to the aura's \`selfPoint\`, in units, **y up** (an image's y grows down: flip it). The screen's centre
   is the middle of a full-window screenshot. A group's children are offset from the group.
4. **Compare** with the compare endpoint (below), adjust, push and compare again; repeat for each situation the
   screenshot shows.

What a picture leaves out: the frames an aura is anchored to (unit frames, nameplates, the cursor; the game screen
draws only stand-ins for them), and anything outside the aura's bounds unless padded.

### Comparing with the screenshot: the compare endpoint

\`POST /api/${game}/workspaces/<id>/compare\` with the player's screenshot as the body (PNG, JPEG or WebP; or a
multipart form's \`screenshot\` file): the server draws the aura (as the screenshot endpoint does), finds the scale
and offset that lay it over the screenshot best, and measures both. Don't write your own pixel scripts: this is the
measurement. Crop the screenshot around the aura, leaving some background at the edges (the background colour is read
from the edge; a plain one measures best). Query parameters (all optional):

- \`aura\`, \`situation\`, \`ref\`: which aura, in which situation, as for the screenshot endpoint. Set the situation to
  the state the screenshot shows.
- \`scale\`: the pixels per unit when you know them (the player told you their UI scale): only the offset is searched.
  Without it the scale is searched (within ±15 % of the one that makes both the same size, then refined).
- \`screenHeight\`: the game window's height in pixels: the answer then also says the UI scale (\`uiScale\`).
- \`image=comparison\`: answer the comparison picture as a PNG instead of JSON (\`image=picture\`: your aura's picture at
  the scale found).

The answer:

- \`scale\` (pixels per UI unit found; \`scaleSearched\`), \`otherScales\` (other scales drawn and placed, with their
  scores: close scores mean the absolute scale is ambiguous, see above), \`uiScale\` (with \`screenHeight\`), \`offset\`
  (where your picture's top left lies on the screenshot, px), \`background\` (\`colour\`, and \`uniform\`: the share of
  edge pixels of that colour; below about 0.8 the measurements are less reliable).
- \`score\`: the mean colour difference (0-255) where either has content; \`overlap\`: the share of those pixels both
  draw. Lower score and higher overlap are closer; a few points of score remain from anti-aliasing and JPEG noise.
- \`regions\`: per display of your aura (\`auraId\`, \`regionType\`): \`layout\` (its frame on the screenshot, px) and
  \`layoutUnits\` (the same in UI units from your picture's top left), \`drawn.picture\` and \`drawn.screenshot\` (the box
  of what each draws in and just around the frame, px: borders drawn outside and overhanging text count), \`delta\`
  (screenshot − picture: left, top, width, height in px; positive width means the screenshot's is wider), \`colour\`
  (the mean colour of each inside the frame, and \`delta\`), \`textRows\` (per text: the heights of its rows of
  glyphs in each, px).
- \`spacing\`: the rows (\`axis\` x) and columns (\`axis\` y) of displays, with \`pitch\` and \`gap\` (px and \`…Units\`) of
  their frames (\`layout\`), of what your picture draws (\`picture\`) and of what the screenshot shows (\`screenshot\`).
  Compare \`picture\` with \`screenshot\`; \`layout\` is what your aura's keys say.
- \`comparison\`: \`{"zoom", "png"}\`, a data URL of the comparison picture: the screenshot, your picture on its
  background, and their difference (red where they differ), side by side, enlarged \`zoom\` times, with your displays'
  frames outlined in magenta. Look at it.

Errors are JSON \`{"error"}\`: 400 a bad parameter or not a picture, 404 nothing to draw, 422 nothing to compare (the
screenshot is all background, or your aura draws nothing in the situation), 503 no headless browser.

**The loop: capture → compare → adjust.**

1. Build the aura from what you read off the screenshot and push it.
2. Compare: \`curl -s -X POST --data-binary @shot.png -H 'Content-Type: image/png' '${o}/api/${game}/workspaces/${d}/compare' > result.json\`,
   and save the picture: \`curl -s -X POST --data-binary @shot.png -H 'Content-Type: image/png' -o comparison.png '${o}/api/${game}/workspaces/${d}/compare?image=comparison'\`.
3. Read \`regions[].delta\`, \`spacing\`, \`colour\` and \`textRows\` and look at \`comparison.png\`: a width delta on every
   icon is a size (or a border inside/outside); a pitch difference is \`space\`; a colour delta is a colour, alpha or
   desaturation; taller text rows are a larger font size.
4. Change the keys, push, compare again (with \`scale\` fixed once you trust it, so only your changes move the numbers).
   Stop when the deltas are within a pixel and the difference picture shows only edges.
`;
}
