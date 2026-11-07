import { describe, expect, it } from "vitest";
import forever from "@/core/addon-vm/client-data.json";
import tbc from "@/core/addon-vm/client-data-tbc.json";

// TBC Anniversary's client data (scripts/client-data.ts wow_anniversary ...): Forever's shape, TBC's content.
describe("TBC client data", () => {
  it("has Forever's shape", () => {
    expect(Object.keys(tbc)).toEqual(Object.keys(forever));
    expect(tbc.build).toBe("2.5.6.70577");
    expect(tbc.source).toContain("wow_anniversary");
  });

  it("has the nine TBC classes with three talent trees each, TBC's 41-point talents included", () => {
    expect(tbc.classes.map((c) => c.file)).toEqual(["WARRIOR", "PALADIN", "HUNTER", "ROGUE", "PRIEST", "SHAMAN", "MAGE", "WARLOCK", "DRUID"]);
    const talents = tbc.talents as Record<string, { tab: number; name: string; tier: number }[]>;
    for (const c of tbc.classes) {
      expect(tbc.talentTabs[c.file as keyof typeof tbc.talentTabs]).toHaveLength(3);
      const list = talents[c.file];
      for (const tab of [1, 2, 3]) expect(list.filter((t) => t.tab === tab).length).toBeGreaterThan(15);
      // Vanilla trees end at tier 7; TBC's go to tier 9.
      expect(Math.max(...list.map((t) => t.tier))).toBe(9);
    }
    expect(talents.DRUID).toContainEqual(expect.objectContaining({ name: "Tree of Life", tab: 3, tier: 9 }));
    expect(talents.DRUID).toContainEqual(expect.objectContaining({ name: "Mangle", tab: 2, tier: 9 }));
    expect(tbc.talentTabs.DRUID.map((t) => t.name)).toEqual(["Balance", "Feral Combat", "Restoration"]);
  });

  it("lists TBC's instance difficulties and weapon/armor sub classes", () => {
    expect(tbc.difficulties).toContainEqual(expect.objectContaining({ id: 2, name: "Heroic", maxPlayers: 5 }));
    expect(tbc.difficulties).toContainEqual(expect.objectContaining({ id: 4, name: "25 Player", maxPlayers: 25 }));
    expect(tbc.itemSubClasses.every((s) => s.classId === 2 || s.classId === 4)).toBe(true);
    expect(tbc.itemSubClasses.length).toBeGreaterThan(20);
  });
});
