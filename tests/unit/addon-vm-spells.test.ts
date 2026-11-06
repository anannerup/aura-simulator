import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  collectSpellIds,
  loadAddon,
  sampleIconAura,
  type AuraCore,
  type AuraDocument,
  type OptionNode,
  type OptionsTree,
} from "@/core";
import { clientSpells } from "@/server/addon/client-spells";
import { createSpellCache, type SpellCache } from "@/server/spells";
import { cachedAddonFetcher } from "../support/addon-source";
import { createFixtureFetch } from "../fixtures/spells/fixture-fetch";

const REF = "v1.15.0";

function find(tree: OptionsTree, key: string): OptionNode {
  const walk = (n: OptionNode): OptionNode | undefined =>
    n.key === key ? n : (n.args ?? []).map(walk).find((x) => x !== undefined);
  const node = tree.tree && walk(tree.tree);
  if (!node) throw new Error(`no option ${key} in ${tree.tab}${tree.error ? `: ${tree.error}` : ""}`);
  return node;
}

describe("collectSpellIds", () => {
  test("finds spell IDs under spell keys and in spell conditions, not elsewhere", () => {
    const aura: AuraDocument = {
      displayIcon: 135932,
      width: 64,
      triggers: {
        "[1]": { trigger: { type: "secretAura", auraspellids: ["1459", "abc", "116"], auraRankSpellIDs: { "[1]": 133 } } },
        "[2]": { trigger: { type: "spell", spellName: 12471, use_spellName: true, duration: "5" } },
      },
      conditions: { "[1]": { check: { trigger: 1, variable: "spellId", value: "2598" } } },
      load: { spellknown: 3964, use_spellknown: true, level: 60 },
    };
    expect(collectSpellIds([aura])).toEqual([116, 133, 1459, 2598, 3964, 12471]);
  });
});

describe("spell names in the addon VM", () => {
  let dir: string;
  let cache: SpellCache;
  let core: AuraCore;
  const asked: number[][] = [];

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "vm-spells-"));
    cache = createSpellCache({ dbPath: path.join(dir, "spells.sqlite"), fetch: createFixtureFetch().fetch });
    await cache.sync();
    core = await loadAddon(REF, {
      fetchSource: cachedAddonFetcher(REF),
      fullAddon: "inline",
      spellInfo: (ids) => {
        asked.push(ids);
        return clientSpells(cache, ids);
      },
    });
  }, 120_000);
  afterAll(() => {
    cache?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("the cache answers what the client knows: name and icon FileDataID; unknown spells are null", async () => {
    const r = await clientSpells(cache, [1459, 99999999]);
    expect(r[1459]).toEqual({ name: "Arcane Intellect", icon: 135932 });
    expect(r[99999999]).toBeNull();
  });

  test('a spell ID input shows "1459 (Arcane Intellect)"', async () => {
    const sample = { aura: sampleIconAura(core.internalVersion), children: [] };
    const trigger = await core.options(sample, { tab: "trigger" });
    expect(String(find(trigger, "trigger.1.secretAura.spellid1").value)).toMatch(/^1459 \(Arcane Intellect\)/);
    // Asked once; the next call doesn't ask again.
    await core.options(sample, { tab: "trigger" });
    expect(asked.flat().filter((id) => id === 1459)).toHaveLength(1);
  });

  test("an unknown spell ID is nil in the VM, as in the game", async () => {
    const aura = sampleIconAura(core.internalVersion);
    const triggers = aura.triggers as Record<string, { trigger: Record<string, unknown> }>;
    triggers["[1]"].trigger.auraspellids = ["99999999"];
    const trigger = await core.options({ aura, children: [] }, { tab: "trigger" });
    expect(String(find(trigger, "trigger.1.secretAura.spellid1").value)).toMatch(/^99999999 \(Unknown Spell\)/);
  });
});
