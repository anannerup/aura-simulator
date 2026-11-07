/**
 * TBC Anniversary's minimal agent docs (ticket 06/07 wiring; the full docs are ticket 08): generated from WeakAuras2's
 * own registries, no combat rules, a push example the addon accepts, and endpoints that exist. Also: the TBC client
 * answers C_Spell from TBC's spell database.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { canonicalize, fromWagoJson, loadAddon, type AuraCore, type OptionNode } from "@/core";
import { clientSpells } from "@/server/addon/client-spells";
import { createSpellCache, type SpellCache } from "@/server/spells";
import { TBC_SPELLS } from "@/games/tbc/sources";
import { collectTbcAddonFacts, type TbcAddonFacts } from "@/games/tbc/docs/addon-facts";
import { TBC_DOCUMENTED_ENDPOINTS, tbcAgentDocsMarkdown } from "@/games/tbc/docs/agent-docs";
import { TBC_MINIMAL_PUSH, TBC_MINIMAL_WAGO_JSON } from "@/games/tbc/examples";
import { createTbcFixtureFetch } from "../fixtures/tbc/spells/fixture-fetch";
import { TBC_TEST_VERSION, weakAuras2Available, weakAuras2Fetcher } from "../support/weakauras2";

const ORIGIN = "http://localhost:3000";
let dir: string;
let spells: SpellCache;
let core: AuraCore | undefined;
let facts: TbcAddonFacts;
let md: string;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "tbc-docs-"));
  spells = createSpellCache({ source: TBC_SPELLS, dbPath: path.join(dir, "spells.sqlite"), fetch: createTbcFixtureFetch().fetch });
  await spells.sync();
  if (!(await weakAuras2Available())) return;
  core = await loadAddon(TBC_TEST_VERSION, {
    fetchSource: weakAuras2Fetcher(),
    game: "tbc",
    fullAddon: "inline",
    spellInfo: (ids) => clientSpells(spells, ids),
  });
  facts = await collectTbcAddonFacts(core);
  md = tbcAgentDocsMarkdown({ origin: ORIGIN, addonRef: TBC_TEST_VERSION, addon: facts });
}, 180_000);
afterAll(() => {
  core?.dispose();
  spells?.close();
  rmSync(dir, { recursive: true, force: true });
});

function loaded(ctx: { skip: () => void }): AuraCore {
  if (!core) ctx.skip();
  return core!;
}

describe("TBC agent docs", () => {
  test("are generated from the WeakAuras2 release: version, display types, sub-elements, trigger types", (ctx) => {
    loaded(ctx);
    expect(md).toContain("WeakAuras 5.22.1 (internalVersion 90)");
    for (const t of facts.regionTypes) expect(md).toContain(`\`${t}\``);
    expect(facts.regionTypes).toEqual(expect.arrayContaining(["icon", "aurabar", "text", "group", "dynamicgroup"]));
    expect(facts.triggers.map((t) => t.type)).toContain("aura2");
    expect(md).toContain('"Cooldown Progress (Spell)"');
    for (const s of facts.subRegionTypes) expect(md).toContain(`\`${s.type}\``);
  });

  test("have no combat rules and no Musca-only triggers", (ctx) => {
    loaded(ctx);
    expect(md).not.toMatch(/## Combat rules|combat\.status|secretAura|Aura \(Modern\)/);
    expect(md).toContain("no combat restrictions");
  });

  test("their push example is accepted by the addon's import and validates without errors", async (ctx) => {
    const c = loaded(ctx);
    const block = /^```json push\n(.*)\n```$/m.exec(md);
    expect(JSON.parse(block![1])).toEqual(TBC_MINIMAL_WAGO_JSON);
    // The wago JSON is the document form's aura, by wago's rules.
    const state = fromWagoJson(block![1]);
    expect(state.aura).toEqual(canonicalize(TBC_MINIMAL_PUSH.aura));
    expect(await c.importCheck(state)).toEqual({ importable: true });
    const result = await c.validate(state);
    expect(result.errors).toEqual([]);
    expect(result.combat).toBeUndefined();
  });

  test("every worked example is wago JSON the addon imports and validates with no problems", async (ctx) => {
    const c = loaded(ctx);
    const blocks = [...md.matchAll(/^```json example=(\S+)\n([\s\S]*?)\n```$/gm)].map((m) => ({ key: m[1], state: fromWagoJson(m[2]) }));
    expect(blocks.map((b) => b.key)).toEqual(["buff-under-3-min", "buff-missing", "cooldown-icon", "target-debuff-bar", "v1-group"]);
    for (const { key, state } of blocks) {
      expect(await c.importCheck(state), key).toEqual({ importable: true });
      const result = await c.validate(state);
      expect({ key, errors: result.errors, warnings: result.warnings }).toEqual({ key, errors: [], warnings: [] });
    }
    expect(md).toContain("## Situation: show that an aura works");
    expect(md).toContain("PUT /api/tbc/workspaces/<id>/situation");
  });

  test("still render without the generated lists when the addon can't be loaded", () => {
    const fallback = tbcAgentDocsMarkdown({ origin: ORIGIN, addonRef: TBC_TEST_VERSION, addon: null });
    expect(fallback).toContain("could not be loaded");
    expect(fallback).toContain("POST /api/tbc/workspaces/<id>/aura");
  });

  test("describe endpoints that exist", () => {
    const API_ROOT = path.resolve(__dirname, "../../src/app/api");
    for (const endpoint of TBC_DOCUMENTED_ENDPOINTS) {
      const [method, url] = endpoint.split(" ");
      const segments = url.replace(/^\/api\/tbc\//, "").split("/").map((s) => (s === "<id>" ? "[id]" : s));
      const file = path.join(API_ROOT, "[game]", ...segments, "route.ts");
      expect(existsSync(file), `${method} ${url}`).toBe(true);
    }
  });
});

describe("the TBC client's C_Spell", () => {
  test("answers from TBC's spell database: a TBC-only rank shows its name in the options", async (ctx) => {
    const c = loaded(ctx);
    // 27126 (Arcane Intellect rank 6) is in wow_anniversary and not in Forever's list.
    expect(await clientSpells(spells, [27126, 99999999])).toEqual({ 27126: { name: "Arcane Intellect", icon: expect.anything() }, 99999999: null });
    const tree = (await c.options({ aura: TBC_MINIMAL_PUSH.aura, children: [] }, { tab: "trigger" })).tree!;
    const values = (n: OptionNode): string[] => [String(n.value ?? ""), ...(n.args ?? []).flatMap(values)];
    expect(values(tree).some((v) => /^27126 \(Arcane Intellect\)/.test(v))).toBe(true);
  });
});
