import { beforeAll, describe, expect, it } from "vitest";
import { diffListings, diffOptionTables, newChangelogSections, summarise, type OptionTables } from "@/server/addon";
import { extractOptionTables } from "@/server/addon/option-tables";
import { cachedAddonFetcher } from "../support/addon-source";

describe("extractOptionTables", () => {
  it("captures defaults and property names, with stubbed WoW values marked", async () => {
    const src = `
      if not WeakAuras.IsLibsOK() then return end
      local AddonName, Private = ...
      local L = WeakAuras.L
      local default = { width = 64, color = {1, 1, 1, 1}, font = GetFontThing(), name = L["Icon"] }
      Private.regionPrototype.AddAlphaToDefault(default)
      local properties = { width = { display = L["Width"], type = "number", softMax = math.ceil(GetScreenWidth() / 20) * 20 } }
      local function GetProperties(data)
        local result = CopyTable(properties)
        result.progressSource.values = {}
        return result
      end
      Private.RegisterRegionType("thing", function() end, function() end, default, GetProperties)
      while CreateFrame("Frame") do end -- never terminates on its own
    `;
    const sub = `
      local default = function(parentType) return { glow = false, parent = parentType } end
      WeakAuras.RegisterSubRegionType("subthing", "Thing", nil, nil, nil, nil, nil, default, nil, { glow = {} })
    `;
    const broken = "this is not lua";
    const t = await extractOptionTables([
      { path: "WeakAuras/RegionTypes/Thing.lua", text: src },
      { path: "WeakAuras/SubRegionTypes/Thing.lua", text: sub },
      { path: "WeakAuras/RegionTypes/Broken.lua", text: broken },
    ]);
    expect(t.regionTypes.thing).toEqual({
      file: "WeakAuras/RegionTypes/Thing.lua",
      defaults: { width: 64, color: [1, 1, 1, 1], font: "<dynamic>", name: "Icon" },
      properties: ["width"],
    });
    expect(t.subRegionTypes.subthing.defaults).toEqual({ glow: false, parent: "icon" });
    expect(t.subRegionTypes.subthing.properties).toEqual(["glow"]);
    expect(t.failures.map((f) => f.file)).toEqual(["WeakAuras/RegionTypes/Broken.lua"]);
  });
});

describe("diffs", () => {
  const table = (defaults: Record<string, unknown>, properties: string[]) => ({ file: "f.lua", defaults, properties });

  it("reports added, removed and changed options per type", () => {
    const changes = diffOptionTables(
      { icon: table({ width: 64, zoom: 0, old: 1 }, ["width"]), gone: table({}, []), same: table({ a: 1 }, ["a"]) },
      { icon: table({ width: 32, zoom: 0, fresh: true }, ["width", "zoom"]), added: table({ b: 2 }, []), same: table({ a: 1 }, ["a"]) },
    );
    expect(changes).toEqual([
      expect.objectContaining({ type: "added", status: "added", addedOptions: ["b"] }),
      expect.objectContaining({ type: "gone", status: "removed" }),
      {
        type: "icon",
        status: "changed",
        addedOptions: ["fresh"],
        removedOptions: ["old"],
        changedDefaults: [{ option: "width", from: 64, to: 32 }],
        addedProperties: ["zoom"],
        removedProperties: [],
      },
    ]);
  });

  it("diffs file listings and only compares hashes from the same source", () => {
    const a = { source: "github-tree" as const, complete: true, files: [{ path: "a", hash: "1" }, { path: "b", hash: "1" }] };
    const b = { source: "github-tree" as const, complete: true, files: [{ path: "b", hash: "2" }, { path: "c", hash: "1" }] };
    expect(diffListings(a, b)).toMatchObject({ added: ["c"], removed: ["a"], changed: ["b"], complete: true });
    expect(diffListings(a, { ...b, source: "jsdelivr-flat" }).changed).toEqual([]);
  });

  it("extracts the changelog sections the newer version adds", () => {
    const old = "# Musca Auras 1.14.0\n\nOld stuff\n";
    const fresh = "# Musca Auras 1.15.0 (2026-11-05)\n\n## New\n\n- Packs\n\n# Musca Auras 1.14.0\n\nOld stuff\n";
    expect(newChangelogSections(old, fresh)).toBe("# Musca Auras 1.15.0 (2026-11-05)\n\n## New\n\n- Packs");
    expect(newChangelogSections(fresh, old)).toBeNull();
    expect(newChangelogSections(null, null)).toBeNull();
  });

  it("summarises in one line per type", () => {
    const options = {
      regionTypes: diffOptionTables({ icon: table({ w: 1 }, []) }, { icon: table({ w: 2, x: 1 }, ["w"]) }),
      subRegionTypes: [],
      unreadable: { from: [], to: [] },
    };
    const files = { added: ["x"], removed: [], changed: [], source: [], complete: true };
    expect(summarise(options, files)).toEqual([
      "Region type icon: new options x; new defaults w 1 → 2; conditions can now change w",
      "Files: 1 added, 0 removed, 0 changed",
    ]);
  });
});

describe("option tables of real addon versions", () => {
  const read = async (ref: string, files: string[]) => {
    const fetchSource = cachedAddonFetcher(ref);
    return extractOptionTables(await Promise.all(files.map(async (p) => ({ path: p, text: await fetchSource(p) }))));
  };
  const FILES = [
    "WeakAuras/RegionTypes/Icon.lua",
    "WeakAuras/RegionTypes/Group.lua",
    "WeakAuras/SubRegionTypes/Glow.lua",
    "WeakAuras/SubRegionTypes/SubText.lua",
  ];
  let v1_3_1: OptionTables;
  let v1_15_0: OptionTables;
  beforeAll(async () => {
    [v1_3_1, v1_15_0] = await Promise.all([read("v1.3.1", FILES), read("v1.15.0", FILES)]);
  });

  it("reads the icon's defaults and conditions properties", () => {
    expect(v1_15_0.failures).toEqual([]);
    expect(v1_15_0.regionTypes.icon.defaults).toMatchObject({ width: 64, height: 64, zoom: 0, cooldown: true });
    expect(v1_15_0.regionTypes.icon.properties).toEqual(expect.arrayContaining(["width", "height", "color", "zoom"]));
    expect(v1_15_0.subRegionTypes.subglow.properties).toEqual(expect.arrayContaining(["glow", "glowColor", "glowType"]));
    expect(v1_15_0.subRegionTypes.subtext.defaults).toHaveProperty("text_text");
  });

  it("finds the group options Musca Auras added after 1.3.1", () => {
    const groupChange = diffOptionTables(v1_3_1.regionTypes, v1_15_0.regionTypes).find((c) => c.type === "group");
    expect(groupChange?.addedOptions).toEqual(expect.arrayContaining(["blizzardFlow", "blizzardFlowGrowth"]));
  });
});
