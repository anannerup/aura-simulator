import path from "node:path";
import { defineConfig } from "@playwright/test";
import { e2eSpellDbPath } from "./tests/support/e2e-spell-db";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  // Seeds the spell database the dev server uses (SPELL_DB_PATH) from fixtures: no network in tests.
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npx next dev -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      SPELL_DB_PATH: e2eSpellDbPath(port),
      // Addon version lists and ref resolution from recorded GitHub/jsDelivr answers (GitHub's
      // unauthenticated rate limit must not fail tests). Addon files are cached on disk across runs
      // (shared by every port and the unit tests), so only the first run downloads them. Live check: LIVE=1, addon-live.test.ts.
      ADDON_UPSTREAM_FIXTURES: path.resolve(__dirname, "tests/fixtures/addon"),
      ADDON_CACHE_DIR: path.resolve(__dirname, ".cache/addon"),
    },
  },
});
