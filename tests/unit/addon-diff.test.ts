import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { loadAddon } from "@/core";
import {
  createAddonSourceCache,
  diffAddonVersions,
  diffListings,
  diffOptionTables,
  newChangelogSections,
  optionTablesOf,
  summarize,
  type OptionTables,
} from "@/server/addon";
import { FOREVER_ADDON } from "@/games/forever/sources";
import { cachedAddonFetcher } from "../support/addon-source";

describe("diffs", () => {
  const table = (defaults: Record<string, unknown>, properties: string[]) => ({ defaults, properties });

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

  it("summarizes in one line per type", () => {
    const options = {
      regionTypes: diffOptionTables({ icon: table({ w: 1 }, []) }, { icon: table({ w: 2, x: 1 }, ["w"]) }),
      subRegionTypes: [],
      unreadable: { from: null, to: null },
    };
    const files = { added: ["x"], removed: [], changed: [], source: [], complete: true };
    expect(summarize(options, files)).toEqual([
      "Region type icon: new options x; new defaults w 1 → 2; conditions can now change w",
      "Files: 1 added, 0 removed, 0 changed",
    ]);
  });
});

describe("option tables of a real addon version", () => {
  let tables: OptionTables;
  beforeAll(async () => {
    const core = await loadAddon("v1.15.0", { fetchSource: cachedAddonFetcher("v1.15.0") });
    tables = optionTablesOf(await core.registries());
    core.dispose();
  });

  it("reads the icon's defaults and conditions properties", () => {
    expect(tables.regionTypes.icon.defaults).toMatchObject({ width: 64, height: 64, zoom: 0, cooldown: true });
    expect(tables.regionTypes.icon.properties).toEqual(expect.arrayContaining(["width", "height", "color", "zoom"]));
    expect(tables.subRegionTypes.subglow.properties).toEqual(expect.arrayContaining(["glow", "glowColor", "glowType"]));
    expect(tables.subRegionTypes.subtext.defaults).toHaveProperty("text_text");
    expect(tables.regionTypes.group.defaults).toHaveProperty("blizzardFlow");
  });
});

describe("diffAddonVersions", () => {
  it("still diffs files and the changelog when a side's options can't be read", async () => {
    const { createFixtureFetch } = await import("../fixtures/forever/addon/fixture-fetch");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const root = mkdtempSync(path.join(tmpdir(), "addon-diff-"));
    try {
      const cache = createAddonSourceCache({ ...FOREVER_ADDON, root, fetch: createFixtureFetch().fetch });
      const registriesOf = async ({ ref }: { ref: string }) => {
        if (ref === "v1.10.0") throw new Error("no full VM for this one");
        return { regionTypes: { icon: { default: { width: 64 }, properties: { width: {} } } }, subRegionTypes: {} } as never;
      };
      const diff = await diffAddonVersions(cache, registriesOf, "v1.15.0", "v1.10.0");
      expect(diff.options).toEqual({ regionTypes: [], subRegionTypes: [], unreadable: { from: null, to: "no full VM for this one" } });
      expect(diff.summary).toContain("Options of the new version couldn't be read: no full VM for this one");
      expect(diff.summary.at(-1)).toMatch(/^Files: /);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
