import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    testTimeout: 60_000,
    // Server code under test (getAddonSourceCache) resolves refs from recorded answers and shares the tests' addon files.
    env: {
      ADDON_UPSTREAM_FIXTURES: path.resolve(__dirname, "tests/fixtures/addon"),
      ADDON_CACHE_DIR: path.resolve(__dirname, ".cache/addon"),
    },
  },
});
