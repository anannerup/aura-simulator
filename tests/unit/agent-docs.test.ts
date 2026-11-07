import { findServerGame } from "@/games/server";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { canonicalize, fromWagoJson, loadAddon, type AuraCore, type AuraDocument } from "@/core";
import { collectAddonFacts, type AddonFacts } from "@/games/forever/docs/addon-facts";
import { agentDocsMarkdown, DOCUMENTED_ENDPOINTS } from "@/games/forever/docs/agent-docs";
import { ALL_DOC_EXAMPLES } from "@/games/forever/docs/worked-examples";
import { cachedAddonFetcher } from "../support/addon-source";

const REF = "v1.15.0";
const ORIGIN = "http://localhost:3000";
let core: AuraCore;
let facts: AddonFacts;
let md: string;

beforeAll(async () => {
  core = await loadAddon(REF, { fetchSource: cachedAddonFetcher(REF) });
  facts = await collectAddonFacts(core);
  md = agentDocsMarkdown({ origin: ORIGIN, addonRef: REF, addon: facts });
}, 120_000);

/** The wago JSON blocks tagged ```json example=<key> combat=<status>, read by wago's rules. */
function exampleBlocks(markdown: string) {
  return [...markdown.matchAll(/^```json example=(\S+) combat=(\S+)\n([\s\S]*?)\n```$/gm)].map((m) => ({
    key: m[1],
    combat: m[2],
    state: fromWagoJson(m[3]),
  }));
}

describe("worked examples", () => {
  test("every example is in the docs as a tagged wago JSON block that reads back as the shared document", () => {
    const blocks = exampleBlocks(md);
    expect(blocks.map((b) => b.key)).toEqual(ALL_DOC_EXAMPLES.map((e) => e.key));
    for (const e of ALL_DOC_EXAMPLES) {
      const block = blocks.find((b) => b.key === e.key)!;
      expect(block.combat).toBe(e.combat);
      expect(block.state.aura).toEqual(canonicalize(e.body.aura));
      expect(block.state.children).toEqual((e.body.children ?? []).map((c: AuraDocument) => canonicalize(c)));
    }
  });

  test("the addon's validation gives each example the combat status the docs promise", async () => {
    for (const e of ALL_DOC_EXAMPLES) {
      const result = await core.validate({ aura: e.body.aura, children: e.body.children ?? [] });
      expect({ key: e.key, status: result.combat?.status }).toEqual({ key: e.key, status: e.combat });
      if (e.combat === "ok") expect(result.errors).toEqual([]);
    }
  });
});

describe("generated from the addon version", () => {
  test("lists the version, region types, trigger verdicts and Aura (Modern) variables", () => {
    expect(md).toContain(`Musca Auras ${REF} (WeakAuras ${core.addonVersion}, internalVersion ${core.internalVersion})`);
    for (const t of facts.regionTypes) expect(md).toContain(`\`${t}\``);
    for (const v of facts.modern.variables) expect(md).toContain(`\`${v.variable}\` (${v.label})`);
    expect(facts.triggers.find((t) => t.event === "Combat Log")?.combat).toBe("broken");
    expect(facts.triggers.find((t) => t.event === "Cooldown Progress (Spell)")?.combat).toBe("ok");
    expect(facts.triggers.find((t) => t.type === "secretAura")?.combat).toBe("ok");
    expect(facts.cooldownConditions.find((c) => c.variable === "onCooldown")?.combat).toBe("ok");
    expect(facts.cooldownConditions.find((c) => c.variable === "expirationTime")?.combat).toBe("limited");
    // What a Missing condition may drive is read from the addon (AuraDisplay.missingRootProperties), not restated.
    expect(facts.modern.missingRootProperties.icon).toEqual(expect.arrayContaining(["desaturate", "color"]));
    expect(md).toContain(`icon: ${facts.modern.missingRootProperties.icon.map((p) => `\`${p}\``).join(", ")}`);
    // Defaults come from fillDefaults.
    expect(facts.regionDefaults.icon.width).toBe(64);
    expect(md).toMatch(/- `aurabar`: .*`width`=200/);
  });

  test("still renders, without the generated lists, when the addon can't be loaded", () => {
    const fallback = agentDocsMarkdown({ origin: ORIGIN, addonRef: REF, addon: null });
    expect(fallback).toContain("could not be loaded");
    expect(exampleBlocks(fallback)).toHaveLength(ALL_DOC_EXAMPLES.length);
  });
});

describe("API endpoints", () => {
  const API_ROOT = path.resolve(__dirname, "../../src/app/api");

  /** The route file for `/api/a/<x>/b`: dynamic segments are `[name]` folders. */
  function routeFile(apiPath: string): string | undefined {
    let dir = API_ROOT;
    for (const segment of apiPath.replace(/^\/api\//, "").split("/")) {
      if (/^<.+>$/.test(segment)) {
        const dynamic = readdirSync(dir).find((n) => /^\[[^.].*\]$/.test(n));
        if (!dynamic) return undefined;
        dir = path.join(dir, dynamic);
      } else {
        dir = path.join(dir, segment);
        if (!existsSync(dir)) return undefined;
      }
    }
    const file = path.join(dir, "route.ts");
    return existsSync(file) ? file : undefined;
  }

  test("every endpoint the docs mention exists with that method", () => {
    const mentioned = new Set([...md.matchAll(/\b(GET|POST|PUT|PATCH|DELETE) (\/api\/[^\s`?]+)/g)].map((m) => `${m[1]} ${m[2]}`));
    for (const m of md.matchAll(/curl -s(?: -X (POST))? '?\$?\{?[^ ]*?(\/api\/[^\s'?\\]+)/g)) {
      mentioned.add(`${m[1] ?? "GET"} ${m[2].replace(/\/\d+$/, "/<id>").replace(/workspaces\/[^/]+/, "workspaces/<id>")}`);
    }
    expect([...mentioned].sort()).toEqual([...DOCUMENTED_ENDPOINTS].sort());
    for (const endpoint of DOCUMENTED_ENDPOINTS) {
      const [method, apiPath] = endpoint.split(" ");
      // The game segment is the `[game]` folder; Forever must be a game the server knows.
      expect(apiPath.startsWith("/api/forever/") && findServerGame("forever")).toBeTruthy();
      const file = routeFile(apiPath.replace(/^\/api\/forever\//, "/api/<game>/"));
      expect(file, `${endpoint}: no route file`).toBeDefined();
      const source = readFileSync(file!, "utf8");
      expect(source, `${endpoint}: no ${method} handler`).toMatch(new RegExp(`export (async function ${method}\\b|\\{ ${method} \\})`));
    }
  });

  test("documents the workspace model, not address codes or short links", () => {
    expect(md).toContain(`${ORIGIN}/forever?w=<id>`);
    expect(md).not.toMatch(/[?&](code|s)=/);
    expect(md).not.toMatch(/short[- ]links?/i);
  });
});
