import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    testTimeout: 60_000,
    // Server code under test (a game's ServerGame) resolves releases from recorded answers, shares the tests' addon
    // files and keeps its spell database out of data/.
    env: {
      ADDON_UPSTREAM_FIXTURES: path.resolve(__dirname, "tests/fixtures"),
      DATA_DIR: path.resolve(__dirname, ".cache/vitest-data"),
      ADDON_CACHE_DIR: path.resolve(__dirname, ".cache/addon"),
    },
  },
});
