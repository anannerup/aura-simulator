/**
 * TBC Anniversary's agent docs (minimal for now: intro, the push API and validation). Served at /tbc/llms.txt,
 * /tbc/docs/agents.md and /tbc/docs/agents. Lists marked generated come from the WeakAuras2 release (`addon-facts.ts`).
 * TBC Anniversary has no combat restrictions, so there are no combat rules here. The full docs with worked examples
 * as wago JSON are ticket 08.
 */
import { DEFAULT_WORKSPACE_ID } from "@/workspace";
import { TBC_MINIMAL_PUSH } from "../examples";
import type { TbcAddonFacts } from "./addon-facts";

export interface TbcAgentDocsFacts {
  /** Origin the app is reached at, e.g. "http://localhost:3000". */
  origin: string;
  /** The release the server follows (shown even when it couldn't be loaded). */
  addonRef: string;
  /** Facts read from that release; null if it couldn't be loaded (the generated lists are then left out). */
  addon: TbcAddonFacts | null;
}

/** The API endpoints the docs describe, as `METHOD /path` with `<param>` placeholders. Tested to exist. */
export const TBC_DOCUMENTED_ENDPOINTS = [
  "POST /api/tbc/workspaces/<id>/aura",
  "GET /api/tbc/workspaces/<id>",
  "GET /api/tbc/workspaces/<id>/events",
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
}

export function tbcAgentDocsMarkdown(f: TbcAgentDocsFacts): string {
  const a = f.addon;
  const version = a
    ? `WeakAuras ${a.addonRef} (internalVersion ${a.internalVersion}), the release zip TBC Anniversary players install`
    : `WeakAuras ${f.addonRef} (it could not be loaded just now, so the lists generated from it are missing; reload later)`;
  const ctx: Ctx = { o: f.origin, d: DEFAULT_WORKSPACE_ID, a, version };
  return [intro, addonLists, pushApi, validation].map((section) => section(ctx)).join("\n");
}

function intro({ version, o }: Ctx): string {
  return `# Aura Simulator: docs for agents (TBC Anniversary)

Aura Simulator previews auras for official **WeakAuras** on **TBC Anniversary** the way the game draws them, and
checks them with the addon's own code. You (the agent) build an aura as a JSON document (the addon's Lua table) and
**push** it to a **workspace**; the player's open page (\`${o}/tbc?w=<id>\`: the **window** with the in-game
**tabs**, beside a **game screen**) shows it live. The player exports it and imports it in the game.

This server follows ${version}. Lists marked *generated* below are read from that release. For another release,
add \`?ref=<version>\` to this page's address and to your pushes.

TBC Anniversary has **no combat restrictions**: auras read full aura information in and out of combat, so there are
no combat rules and no combat check. Write auras as for plain WeakAuras.

These docs are short for now: the document format follows WeakAuras' own saved variables (\`triggers\` is
\`{"[1]": {"trigger": {...}, "untrigger": {}}, "activeTriggerMode": -10}\`, number keys as \`"[N]"\`), and the
addon fills defaults for whatever you leave out. Spell IDs are TBC Anniversary's (\`GET /api/tbc/spells/search?q=<name>\`).

Contents: The addon (generated) · Push API · Validation.
`;
}

function addonLists({ a }: Ctx): string {
  if (!a) return `## The addon\n\nThe addon could not be loaded, so the generated lists are missing.\n`;
  const triggers = a.triggers
    .map((t) => `- \`${t.type}\`${t.events.length ? `: ${t.events.map((e) => `"${e.event}"`).join(", ")}` : ""}`)
    .join("\n");
  return `## The addon (generated)

Display types (\`regionType\`): ${codes(a.regionTypes)}.

Sub-element types (\`subRegions[].type\`) and the displays they fit:
${a.subRegionTypes.map((s) => `- \`${s.type}\` (${s.displayName}): ${s.supports.join(", ")}`).join("\n")}

Trigger types (\`trigger.type\`) and their events (\`trigger.event\`). Buffs and debuffs use \`aura2\` ("Aura"):
${triggers}
`;
}

function pushApi({ o, d }: Ctx): string {
  return `## Push API

A **workspace** is what an open page shows: top-level auras (displays and groups), all drawn at once on the game
screen, one selected. Workspace IDs are 1-64 of \`A-Z a-z 0-9 _ -\`. Workspaces are per game: \`/api/tbc/...\` never
sees Forever's.

### POST /api/tbc/workspaces/<id>/aura

Body: \`{"aura": {...}}\` for one aura, \`{"aura": {...group...}, "children": [...]}\` for a group (every descendant,
flattened, groups first), or \`{"code": "!WA:2!..."}\` (an import string). A minimal aura:

\`\`\`json push
${JSON.stringify(TBC_MINIMAL_PUSH)}
\`\`\`

\`\`\`sh
curl -s -X POST ${o}/api/tbc/workspaces/${d}/aura \\
  -H 'Content-Type: application/json' \\
  --data-binary @aura.json
\`\`\`

Answer (200): \`{"workspace", "revision", "updatedAt", "url", "code", "validation": {...}}\`. Errors:
\`{"error": "..."}\` with 400 (malformed request), 413 (over 32 MB), 422 (the addon refuses it, e.g. a code made with
a newer WeakAuras: the addon's own import message says so), 503 (the addon couldn't be loaded; retry). Add
\`?validate=false\` to skip validation. The answer's \`url\` is the page that follows this workspace.

The pushed aura, with a group's subtree, **replaces the top-level aura with the same \`uid\`, else the same \`id\`**,
or is added at the end, and becomes selected.

- \`GET /api/tbc/workspaces/<id>\` → \`{"id", "code", "updatedAt", "revision", "source", "url"}\`: the top-level aura
  pushed or changed last (the page reports the player's edits here).
- \`GET /api/tbc/workspaces/<id>/events\` → Server-Sent Events: \`snapshot\`, then \`state\` on every change.
- In a browser tab on the page: \`await window.auraSimulator.load(input)\` takes what a push takes and answers
  \`{ok: true, id, code}\` or \`{ok: false, error}\`; \`auraSimulator.code(id?)\`, \`auraSimulator.state(id?)\`.

Only the addon's encoder makes an import string; take it from the push answer's \`code\` or let the player export.
`;
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
