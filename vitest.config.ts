import { defineConfig, type TestProjectInlineConfiguration } from "vitest/config";
import path from "node:path";
import type { Shard } from "./tests/support/shards";

/**
 * Two tiers (AGENTS.md, "Tests"): `npm test` runs the project "unit" (every test file but the exhaustive suites, well
 * under a minute); `npm run test:all` runs every project: "unit" and the exhaustive suites below, each split into
 * shards that run in parallel (tests/support/shards.ts).
 */
const EXHAUSTIVE: { name: string; file: string; shards: Omit<Shard, "index">[] }[] = [
  // The option reference replayed, probe by probe, per game: its display and trigger types dealt out. Each shard takes
  // about a minute and a half on an idle machine (the longest of the full tier); more shards would cost more CPU: each
  // settles the bases of its own units.
  {
    name: "option-reference",
    file: "src/core/option-reference.test.ts",
    shards: [...Array<Omit<Shard, "index">>(3).fill({ count: 3, game: "forever" }), ...Array<Omit<Shard, "index">>(3).fill({ count: 3, game: "tbc" })],
  },
  // The tab sweep at seam A: one shard per game.
  { name: "options-sweep", file: "src/core/options-sweep.test.ts", shards: [{ count: 1, game: "forever" }, { count: 1, game: "tbc" }] },
  // The recorded wago.io TBC auras, dealt out by size.
  { name: "wago-tbc", file: "src/core/wago-tbc.test.ts", shards: Array<Omit<Shard, "index">>(4).fill({ count: 4 }) },
];

/** Each shard's project, named "<suite> [game] <i>/<n>". */
function shardProjects(suite: (typeof EXHAUSTIVE)[number]): TestProjectInlineConfiguration[] {
  const seen = new Map<string, number>();
  return suite.shards.map(({ count, game }) => {
    const index = seen.get(game ?? "") ?? 0;
    seen.set(game ?? "", index + 1);
    const shard: Shard = { index, count, ...(game && { game }) };
    return {
      extends: true,
      test: { name: [suite.name, game, `${index + 1}/${count}`].filter(Boolean).join(" "), include: [suite.file], provide: { shard } },
    };
  });
}

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    testTimeout: 60_000,
    // Server code under test (a game's ServerGame) resolves releases from recorded answers, shares the tests' addon
    // files (the e2e server's folders: TBC's WeakAuras2 zip unpacked once, in tests/support/weakauras2.ts's folder)
    // and keeps its spell database out of data/.
    env: {
      ADDON_UPSTREAM_FIXTURES: path.resolve(__dirname, "tests/fixtures"),
      DATA_DIR: path.resolve(__dirname, ".cache/vitest-data"),
      ADDON_CACHE_DIR: path.resolve(__dirname, ".cache/addon"),
      ADDON_CACHE_DIR_TBC: path.resolve(__dirname, ".cache/weakauras2"),
    },
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"], exclude: EXHAUSTIVE.map((s) => s.file) },
      },
      ...EXHAUSTIVE.flatMap(shardProjects),
    ],
  },
});
