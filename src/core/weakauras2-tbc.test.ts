/**
 * Seam A for TBC Anniversary: official WeakAuras2 from its release zip (5.22.1, `_TBC.toc` file sets) in the aura core,
 * with the TBC client profile. The zip is downloaded once into .cache/weakauras2; without it (offline) these skip.
 * The tab sweep for TBC is in options-sweep.test.ts.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { loadAddon, type AuraCore, type AuraState } from "@/core";
import { TBC_TEST_VERSION, weakAuras2Available, weakAuras2Fetcher } from "../../tests/support/weakauras2";

let core: AuraCore | undefined;

beforeAll(async () => {
  if (!(await weakAuras2Available())) return;
  core = await loadAddon(TBC_TEST_VERSION, { fetchSource: weakAuras2Fetcher(), game: "tbc" });
}, 120_000);
afterAll(() => core?.dispose());

/** The loaded core, or skips the test (offline, no cached zip). */
function tbc(ctx: { skip: () => void }): AuraCore {
  if (!core) ctx.skip();
  return core!;
}

const TYPES = ["icon", "aurabar", "text", "texture", "progresstexture", "stopmotion", "model", "empty"];

async function newState(c: AuraCore, regionType: string): Promise<AuraState> {
  return { aura: { ...(await c.newAura(regionType)), id: `New ${regionType}` }, children: [] };
}

describe("light VM", () => {
  test("is the release's own version: versionString 5.22.1 (not the source tree's Dev), internalVersion 90", (ctx) => {
    const c = tbc(ctx);
    expect(c.addonVersion).toBe("5.22.1");
    expect(c.internalVersion).toBe(90);
  });

  test("a code round-trips, and carries the release's version string", async (ctx) => {
    const c = tbc(ctx);
    const state = await newState(c, "icon");
    const code = c.encode(state);
    expect(code.startsWith("!WA:2!")).toBe(true);
    const decoded = c.decode(code);
    expect(decoded.aura).toEqual(state.aura);
    expect(decoded.children).toEqual([]);
    expect(decoded.senderVersion).toBe("5.22.1");
    expect(decoded.transmissionVersion).toBe(1421);
  });

  test("a group with its children round-trips", async (ctx) => {
    const c = tbc(ctx);
    const group = { ...(await c.newAura("group")), id: "G", controlledChildren: ["A"] };
    const child = { ...(await c.newAura("icon")), id: "A", parent: "G" };
    const decoded = c.decode(c.encode({ aura: group, children: [child] }));
    expect(decoded.aura).toEqual(group);
    expect(decoded.children).toEqual([child]);
  });
});

describe("full VM", () => {
  test("loads WeakAuras and WeakAurasOptions from the _TBC.toc file sets without errors and logs in", async (ctx) => {
    const report = await tbc(ctx).loadFullAddon();
    expect(report.fileErrors).toEqual([]);
    expect(report.loginFinished).toBe(true);
    expect(report.files).toBeGreaterThan(150);
  });

  test("runs as the TBC flavor: registries carry the release's versions and TBC's trigger prototypes", async (ctx) => {
    const r = await tbc(ctx).registries();
    expect(r.versionString).toBe("5.22.1");
    expect(r.internalVersion).toBe(90);
    expect(r.addonVersion).toBe("5.22.1");
    const names = Object.values(r.eventPrototypes as Record<string, { name: string }>).map((p) => p.name);
    // Prototypes.lua removes these on TBC (retail/Wrath-only) and keeps Swing Timer (removed on Cata/Mists).
    expect(names).not.toContain("Death Knight Rune");
    expect(names).not.toContain("Alternate Power");
    expect(names).toContain("Swing Timer");
    // No Musca additions: no Aura (Modern) trigger type or registries.
    expect(r.triggerTypes).not.toContain("secretAura");
    expect(r.secretAura).toBeUndefined();
  });

  test("New Aura offers WeakAuras2's display types and makes each one at the addon's internal version", async (ctx) => {
    const c = tbc(ctx);
    const page = await c.newAuraPage();
    expect(page.types.map((t) => t.regionType).sort()).toEqual([...TYPES, "group", "dynamicgroup"].sort());
    for (const type of TYPES) expect((await c.newAura(type)).internalVersion).toBe(90);
    // Only what WeakAuras2 offers: Premade Auras, no Modern Aura Group and no Packs (Musca Auras' own).
    expect(page.premade.name).toBe("Premade Auras");
    expect(page.modernGroup).toBeUndefined();
    expect(page.packs).toBeUndefined();
    await expect(c.packs()).rejects.toThrow(/WeakAuras has no Packs page/);
  });

  test("the Load tab lists TBC's client data and WeakAuras2's TBC options (races, difficulties, item types)", async (ctx) => {
    const c = tbc(ctx);
    const tree = (await c.options(await newState(c, "icon"), { tab: "load" })).tree!;
    const all = (n: typeof tree): (typeof tree)[] => [n, ...(n.args ?? []).flatMap(all)];
    const labels = (key: string) => (all(tree).find((n) => n.key === key)?.values ?? []).map(([, l]) => String(l));
    expect(labels("multiselect_race")).toEqual(expect.arrayContaining(["Blood Elf", "Draenei"]));
    expect(labels("multiselect_instance_type")).toEqual(expect.arrayContaining(["Dungeon (Heroic)"]));
    expect(labels("multiselect_itemtypeequipped")).toContain("Two-Handed Swords");
    expect(labels("multiselect_talent").length).toBeGreaterThan(50);
  });

  test("the editor registers nested groups as the game's import does: no addon errors for any of them", async (ctx) => {
    const c = tbc(ctx);
    const init = { init: { do_custom: true, custom: "aura_env.ready = true" }, start: {}, finish: {} };
    const g = { ...(await c.newAura("group")), id: "G", controlledChildren: ["S"] };
    const s = { ...(await c.newAura("group")), id: "S", parent: "G", controlledChildren: ["A"] };
    const a = {
      ...(await c.newAura("icon")),
      id: "A",
      parent: "S",
      actions: init,
      triggers: {
        "[1]": {
          trigger: { type: "custom", custom_type: "stateupdate", custom: "function(allstates) return false end", events: "PLAYER_TARGET_CHANGED" },
          untrigger: [],
        },
      },
    };
    const problems: string[] = [];
    const state = { aura: g, children: [s, a] };
    for (const selected of ["G", "S", "A"]) {
      for (const { key } of (await c.options(state, { selected })).tabs) {
        const r = await c.options(state, { selected, tab: key });
        if (r.error || r.warning) problems.push(`${selected} ${key}: ${r.error ?? r.warning}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("validation", () => {
  test("a new aura of every display type validates clean, with no combat verdict (TBC has no combat restrictions)", async (ctx) => {
    const c = tbc(ctx);
    for (const type of TYPES) {
      const result = await c.validate(await newState(c, type));
      expect(result.errors, type).toEqual([]);
      expect(result, type).not.toHaveProperty("combat");
    }
  });

  test("an aura2 trigger by exact spell ID gets no combat warning (Forever's would: combat.hiddenValues)", async (ctx) => {
    const c = tbc(ctx);
    const state = await newState(c, "icon");
    const aura = {
      ...state.aura,
      triggers: {
        "[1]": { trigger: { type: "aura2", unit: "target", debuffType: "HARMFUL", useExactSpellId: true, auraspellids: ["33763"] }, untrigger: [] },
        activeTriggerMode: -10,
      },
    };
    const result = await c.validate({ aura, children: [] });
    expect(result).not.toHaveProperty("combat");
    expect([...result.errors, ...result.warnings].filter((m) => /^(combat|modern)\./.test(m.code))).toEqual([]);
  });

  test("the Talent load option works: C_SpecializationInfo.GetTalentInfo answers (2.5.6 API docs, FrameXML's GetTalentInfo)", async (ctx) => {
    const c = tbc(ctx);
    const state = await newState(c, "icon");
    const aura = { ...state.aura, load: { use_class: true, class: { single: "SHAMAN", multi: [] }, use_talent: true, talent: { single: 1, multi: [] } } };
    const result = await c.validate({ aura, children: [] });
    expect([...result.errors, ...result.warnings]).toEqual([]);
    const load = await c.options({ aura, children: [] }, { tab: "load" });
    expect(load.error).toBeUndefined();
  });

  test("a group's validation has no combat verdict either", async (ctx) => {
    const c = tbc(ctx);
    const group = { ...(await c.newAura("group")), id: "G", controlledChildren: ["A"] };
    const child = { ...(await c.newAura("icon")), id: "A", parent: "G" };
    const result = await c.validate({ aura: group, children: [child] });
    expect(result).not.toHaveProperty("combat");
  });

  test("the addon's own messages come through (an unknown display type: its sub elements are refused)", async (ctx) => {
    const c = tbc(ctx);
    const state = await newState(c, "icon");
    const result = await c.validate({ aura: { ...state.aura, regionType: "nosuch" }, children: [] });
    expect(result.errors.map((e) => e.message).join("\n")).toMatch(/unknown or incompatible sub element type 'subtext'/);
  });

  test("fillDefaults runs WeakAuras2's PreAdd: a bare aura gets the data stub's defaults", async (ctx) => {
    const c = tbc(ctx);
    const filled = await c.fillDefaults({ aura: { id: "Bare", regionType: "icon" }, children: [] });
    expect(filled.aura.internalVersion).toBe(90);
    expect(filled.aura.load).toBeDefined();
    expect(filled.aura.triggers).toBeDefined();
  });
});
