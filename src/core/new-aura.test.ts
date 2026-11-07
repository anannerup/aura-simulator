import { beforeAll, describe, expect, test } from "vitest";
import { loadAddon, type AuraCore } from "@/core";
import { cachedAddonFetcher } from "../../tests/support/addon-source";

const REF = "v1.15.0";
let core: AuraCore;

beforeAll(async () => {
  core = await loadAddon(REF, { fetchSource: cachedAddonFetcher(REF) });
  await core.loadFullAddon();
}, 120_000);

describe("the New Aura page", () => {
  test("lists the addon's display types in the window's order, with the game's names and descriptions", async () => {
    const page = await core.newAuraPage();
    const types = page.types.map((t) => t.regionType);
    expect(types.slice(0, 2)).toEqual(["group", "dynamicgroup"]);
    expect(new Set(types)).toEqual(
      new Set(["group", "dynamicgroup", "icon", "aurabar", "text", "texture", "progresstexture", "stopmotion", "model", "empty"]),
    );
    const bar = page.types.find((t) => t.regionType === "aurabar")!;
    expect(bar.displayName).toBe("Progress Bar");
    expect(bar.description).toBe("Shows a progress bar with name, timer, and icon");
    expect(page.types.find((t) => t.regionType === "icon")!.icon).toMatch(/spell_holy_sealofsalvation/i);
    expect(page.modernGroup?.name).toBe("Modern Aura Group");
    expect(page.modernGroup?.sourceData).toMatchObject({ blizzardFlow: true });
    expect(page.packs?.name).toBe("Packs");
  });

  test("every display type is created by the addon's own WeakAuras.NewAura, with its defaults", async () => {
    const page = await core.newAuraPage();
    for (const { regionType } of page.types) {
      const aura = await core.newAura(regionType);
      expect(aura.regionType, regionType).toBe(regionType);
      expect(aura.internalVersion, regionType).toBe(core.internalVersion);
      expect(typeof aura.uid, regionType).toBe("string");
      expect(aura.triggers, regionType).toBeDefined();
      expect(aura.load, regionType).toBeDefined();
      // A state code round trip works for the new aura.
      const state = { aura, children: [] };
      expect(core.decode(core.encode(state)).aura).toEqual(aura);
    }
    const icon = await core.newAura("icon");
    expect(icon.width).toBe(64);
    const bar = await core.newAura("aurabar");
    expect(bar.subRegions).toBeDefined();
  });

  test("a Modern Aura Group is a group with the addon's flow settings", async () => {
    const page = await core.newAuraPage();
    const group = await core.newAura("group", page.modernGroup!.sourceData as never);
    expect(group).toMatchObject({ regionType: "group", blizzardFlow: true, blizzardFlowGrowth: "RIGHT" });
  });

  test("the Packs page offers the addon's utility packs and class HUDs with import data", async () => {
    const packs = await core.packs();
    expect(packs.utility.length).toBeGreaterThan(0);
    const pack = packs.utility[0];
    expect(pack.name).toBeTruthy();
    expect(core.decode(pack.code!).aura.id).toBeTruthy();
    const druid = packs.classes.find((c) => c.class === "DRUID")!;
    expect(druid.blocks.length).toBeGreaterThan(0);
    expect(druid.blocks[0].aura.id).toBeTruthy();
    expect(core.decode(druid.code!).children.length).toBeGreaterThan(0);
  });
});
