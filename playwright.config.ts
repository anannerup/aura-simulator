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
    env: { SPELL_DB_PATH: e2eSpellDbPath(port) },
  },
});
