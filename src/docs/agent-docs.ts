import { DEFAULT_WORKSPACE_ID, MAX_ADDRESS_CODE_LENGTH } from "@/workspace";

/** Facts the docs take from the running code, so examples stay true. */
export interface AgentDocsFacts {
  /** Origin the app is reached at, e.g. "http://localhost:3000". */
  origin: string;
  addonRef: string;
  /** WeakAuras.versionString of that addon version; null if the addon couldn't be loaded. */
  addonVersion: string | null;
  internalVersion: number | null;
  /** The sample icon aura document (canonical JSON). */
  sampleAura: unknown;
  /** Its state code, encoded by the addon; null if the addon couldn't be loaded. */
  sampleCode: string | null;
}

/**
 * The agent docs as Markdown: served as-is at /llms.txt and /docs/agents.md, rendered at /docs/agents.
 * Ticket 16 extends this into full docs generated from the addon's options and combat rules.
 */
export function agentDocsMarkdown(f: AgentDocsFacts): string {
  const o = f.origin;
  const d = DEFAULT_WORKSPACE_ID;
  const version = f.addonVersion
    ? `Musca Auras ${f.addonRef} (WeakAuras ${f.addonVersion}, internalVersion ${f.internalVersion})`
    : `Musca Auras ${f.addonRef} (could not be loaded right now, so the example state code is missing)`;
  return `# Aura Simulator: docs for agents

Aura Simulator previews auras for **Musca Auras**, the WeakAuras fork for WoW Forever, the way the game
draws them, and gives the player the import string to paste into the game. You (the agent) build an aura
as a JSON document, push it to the running app, and the player's open page shows it live.

This server follows ${version}.

## The aura document

An aura is the Lua table the addon stores for it, written as JSON (the canonical form; the app returns
documents in this form and accepts anything that canonicalizes to it):

- Strings, numbers and booleans are themselves. Lua has no null: leave a field out instead.
- A table whose keys are exactly 1..n (n >= 1) is a JSON **array**. Arrays can't have holes.
- Any other table, including the empty table \`{}\`, is a JSON **object**.
- Object keys say which Lua key they stand for: \`name\` is the string key "name"; \`[1]\` is the
  **number** key 1; \`[true]\` is the boolean key true; \`["[x"]\` is a string key that starts with "[".
  So \`{"1": ...}\` is Lua \`{["1"] = ...}\` and \`{"[1]": ...}\` is Lua \`{[1] = ...}\`.
- Mixed tables stay objects: WeakAuras' \`triggers\` is \`{"[1]": {...}, "activeTriggerMode": -10}\`.
- Whole numbers must stay within ±(2^53 - 1).

Example: the built-in sample, an Arcane Intellect icon on the player using the fork's combat-safe
"Aura (Modern)" trigger (\`secretAura\`):

\`\`\`json
${JSON.stringify(f.sampleAura, null, 2)}
\`\`\`

A group is pushed as its own document plus \`children\`: every descendant, flattened in the addon's
traversal order (the group's \`controlledChildren\` lists the child \`id\`s).

## State codes

A **state code** is the addon's own import string (\`!WA:2!...\`, plain, not encrypted): the whole aura
encoded, the way a chess FEN is a whole position. The player pastes it into Musca Auras' import dialog.
The page address always holds the current state code, so a link is a saved aura:

- \`${o}/?code=<state code>\` while the code fits (encoded value up to ${MAX_ADDRESS_CODE_LENGTH} characters);
  percent-encode it (\`(\` → \`%28\`, \`)\` → \`%29\`).
- \`${o}/?s=<short id>\` for longer codes: the server stores the code under a short ID.
- \`w=<workspace id>\` (optional, e.g. \`?w=abc&code=...\`) picks the workspace the page follows; without it
  the page follows \`${d}\`.
${f.sampleCode ? `\nThe sample above as a state code:\n\n\`\`\`text\n${f.sampleCode}\n\`\`\`\n` : ""}
## Pushing to the open page

A **workspace** is what an open page shows. Every page follows one workspace ID (shown under the
preview; \`${d}\` unless the address has \`?w=\`). Push to it and every page on it updates live.

### POST /api/workspaces/<id>/aura

Body: \`{"aura": {...}, "children": [...]}\` (\`children\` only for groups), or \`{"code": "!WA:2!..."}\`,
or a bare state code as plain text. The server checks it with the addon's own decoder/encoder.

\`\`\`sh
curl -s -X POST ${o}/api/workspaces/${d}/aura \\
  -H 'Content-Type: application/json' \\
  -d '{"aura": {"id": "My aura", "regionType": "icon", "width": 48, "height": 48, "displayIcon": 135932,
       "triggers": {"[1]": {"trigger": {"type": "secretAura", "unit": "player", "debuffType": "HELPFUL",
       "auraspellids": ["1459"]}, "untrigger": {}}, "activeTriggerMode": -10}}}'

curl -s -X POST ${o}/api/workspaces/${d}/aura --data-binary @aura.txt   # a state code in a file
\`\`\`

Answer (200):

\`\`\`json
{"workspace": "${d}", "code": "!WA:2!...", "url": "${o}/?code=...", "updatedAt": "...", "revision": 3}
\`\`\`

\`url\` opens exactly this aura (a short link when the code is long): hand it to the player if no page is
open. Errors answer \`{"error": "..."}\`: 400 malformed request, 413 too large, 422 the addon rejects
it, 503 the addon couldn't be loaded.

### Other workspace endpoints

- \`GET /api/workspaces/<id>\` → \`{"id", "code", "updatedAt", "revision", "url"}\`: what the page shows
  right now (\`code\` is null until a page or agent has set it since the server started). Read this to
  see the player's changes.
- \`GET /api/workspaces/<id>/events\` → Server-Sent Events: \`event: snapshot\` with that snapshot on
  connect, then \`event: state\` with it on every change.
- \`POST /api/short-links\` with \`{"code"}\` → \`{"id", "url"}\`; \`GET /api/short-links/<id>\` → \`{"id", "code"}\`.

Workspace IDs are 1-64 characters of \`A-Z a-z 0-9 _ -\`.

## Spells

Use Forever's real spell IDs (they can differ from other WoW versions). The server keeps a spell cache
synced from wago.tools (Forever's own data) with icons and tooltips from Wowhead.

- \`GET /api/spells/search?q=<name or ID>&limit=<1-100>\` → \`{"query", "build", "results": [{"id", "name", "icon", "iconUrl"}]}\`
- \`GET /api/spells/<id>\` → spell details with \`flags\` (e.g. \`not-in-forever\`, \`name-mismatch\`): tell the
  player to double-check flagged spells in the game. 404 when no source knows the ID.
- \`GET /api/spells/status\`; \`POST /api/spells/sync\` refreshes the cache (slow, hits the internet).

\`\`\`sh
curl -s '${o}/api/spells/search?q=arcane%20intellect'
\`\`\`

An icon aura's \`displayIcon\` is the icon's file ID; spell IDs go in the trigger as strings
(\`"auraspellids": ["1459"]\`).

## Validation and combat warnings

Every push answer has a \`validation\` field with the addon's own checks, run by the real Musca Auras
code:

\`\`\`json
{ "errors": [], "warnings": [], "combat": { "status": "ok" | "limited" | "broken", "messages": [] } }
\`\`\`

Each message has a \`code\`, a \`severity\`, the addon's own \`text\`, and where possible a \`pointer\`
(tab, trigger/condition/change index, \`path\` of Lua keys and a readable \`label\` such as
"Condition 1, change 1 (desaturate)"). Export is never blocked: when the status is \`limited\` or
\`broken\`, tell the player what stops working in combat and offer the closest version that works.

Rules of thumb for WoW Forever:
- For the player's own buffs and debuffs, use the "Aura (Modern)" trigger (\`"type": "secretAura"\`).
  The classic "Aura" trigger (\`aura2\`) with names or spell IDs freezes in combat.
- An Aura (Modern) remaining-time condition may only turn on a glow or change the \`%p\` text colour or
  visibility. Desaturate and colour are allowed on the "missing" state (\`faAuraMissing\`), which needs
  Show On \`showOnMissing\` or \`showAlways\`.
- If one Aura (Modern) condition is invalid, none of the aura's conditions run.
`;
}
