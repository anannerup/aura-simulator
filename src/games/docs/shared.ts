/**
 * Agent-doc sections that are the same concept in every game, so each game's docs (`src/games/<game>/docs/`) use them
 * with its own id: wago JSON (wago.io's rules don't depend on the game), the push API and the workspace file (the
 * app's own, per game only by URL), and wago links. Everything about an addon (its triggers, rules, defaults,
 * examples) stays in the game's own docs.
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

/** The push API, reading the workspace, the workspace file, `window.auraSimulator` and handing over files. */
export function pushApiSection({ game, origin: o, workspace: d, checkName }: PushApiSection): string {
  return `## Push API

A **workspace** is what an open page shows: top-level auras (displays and groups), all drawn at once on the game
screen, one selected. Workspace IDs are 1-64 of \`A-Z a-z 0-9 _ -\`.

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

Answer (200): \`{"workspace", "revision", "updatedAt", "validation": {...}}\` (and the import string, which you don't
need). Errors: \`{"error": "..."}\` with 400 (malformed request), 413 (too large), 422 (wago's rules or the addon
reject the aura), 404/502 (a wago link wago doesn't have or didn't answer), 503 (the addon couldn't be loaded; retry). Bodies may be up to 32 MB. Add \`?validate=false\` to skip validation
(it takes seconds for very large auras); \`validation\` is then null. The answer's \`url\` is the page that follows
this workspace (\`?w=\`): if no page is open, hand it to the player and the pushed aura is waiting there.

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
  megabytes); fetch \`GET /api/${game}/workspaces/<id>?revision=<n>\` for the code.

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

### In the browser tab: \`window.auraSimulator\`

If you drive the player's page in a browser tab (browser automation, a devtools console), use its in-page command
instead of clicking through forms. It exists once the page has restored its workspace (wait for it):

- \`await auraSimulator.load(input)\` takes what a push takes except wago links: wago JSON (an object or its text),
  \`{aura, children?}\`, \`{code}\`, or an import string. It
  merges like a push (same \`uid\`, else \`id\`, replaces; otherwise added), selects it, and the window, browser
  storage and server follow. Resolves to \`{ok: true, id, code}\` or \`{ok: false, error}\` (nothing changed; e.g. the
  addon's import refuses an aura made with a newer version).
- \`auraSimulator.code(id?)\`: the import string of an aura (a group's holds everything in it); the selected one by
  default. \`auraSimulator.state(id?)\`: its \`{aura, children}\`, what \`load\` takes. \`auraSimulator.workspaceId\`.

\`\`\`js
await page.waitForFunction(() => window.auraSimulator);
const r = await page.evaluate((aura) => window.auraSimulator.load({ aura }), myAura);
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
  \`code\` (\`?validate=false\` on a scratch workspace id if you only want the string), from \`auraSimulator.code()\`, or
  from the player.
- With no import string at all, write a workspace file (above) holding the aura document instead: the player imports
  it and exports the import string from the window.
`;
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
