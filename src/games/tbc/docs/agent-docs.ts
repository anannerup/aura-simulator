/**
 * TBC Anniversary's agent docs (minimal for now: intro, wago JSON, push API, wago links, validation). Served at /tbc/llms.txt,
 * /tbc/docs/agents.md and /tbc/docs/agents. Lists marked generated come from the WeakAuras2 release (`addon-facts.ts`);
 * the sections that are the same in every game come from `src/games/docs/shared.ts`.
 * TBC Anniversary has no combat restrictions, so there are no combat rules here. The full docs with worked examples
 * as wago JSON are ticket 08.
 */
import type { OptionReference } from "@/core";
import { DEFAULT_WORKSPACE_ID } from "@/workspace";
import { optionReferenceSection } from "../../docs/option-reference";
import { pushApiSection, wagoJsonSection, wagoLinksSection } from "../../docs/shared";
import { tbc } from "..";
import { TBC_MINIMAL_WAGO_JSON } from "../examples";
import type { TbcAddonFacts } from "./addon-facts";

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
  "GET /api/tbc/workspaces/<id>/events",
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
  return [intro, wagoJson, addonLists, optionTableReference, pushApi, wagoLinks, validation].map((section) => section(ctx)).join("\n");
}

function intro({ version, o }: Ctx): string {
  return `# Aura Simulator: docs for agents (TBC Anniversary)

Aura Simulator previews auras for official **WeakAuras** on **TBC Anniversary** the way the game draws them, and
checks them with the addon's own code. You (the agent) write an aura as wago JSON and **push** it to a
**workspace**; the player's open page (\`${o}/tbc?w=<id>\`: the **window** with the in-game **tabs**, beside a
**game screen**) shows it live. The player exports it and imports it in the game.

This server follows ${version}. Lists marked *generated* below are read from that release. For another release,
add \`?ref=<version>\` to this page's address and to your pushes.

TBC Anniversary has **no combat restrictions**: auras read full aura information in and out of combat, so there are
no combat rules and no combat check. Write auras as for plain WeakAuras. Spell IDs are TBC Anniversary's
(\`GET /api/tbc/spells/search?q=<name>\`, \`GET /api/tbc/spells/<id>\`).

These docs are short for now. A minimal aura, ready to push:

\`\`\`json push
${JSON.stringify(TBC_MINIMAL_WAGO_JSON)}
\`\`\`

Contents: wago JSON · The addon (generated) · Option ↔ table reference · Push API · Wago links · Validation.
`;
}

/** The option ↔ table reference: which wago JSON keys each option writes, and back (generated from the release). */
function optionTableReference({ o, r, ref }: Ctx): string {
  return optionReferenceSection(o, tbc.id, ref, r);
}

function wagoJson(): string {
  return wagoJsonSection({ minimal: TBC_MINIMAL_WAGO_JSON, groupsBelow: false, defaultsBelow: false });
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
  return pushApiSection({ game: "tbc", origin: o, workspace: d, checkName: "Addon check" });
}

function wagoLinks({ o, d }: Ctx): string {
  return wagoLinksSection({ game: "tbc", origin: o, workspace: d });
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
