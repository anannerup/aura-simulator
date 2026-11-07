import { defineConfig } from "@playwright/test";
import { e2eServerEnv } from "./tests/support/e2e-server";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  // Every test runs in a workspace of its own, so the tests of a file run in parallel too (a long file such as the
  // tab sweep is spread over all workers instead of running on one).
  fullyParallel: true,
  // Above the 60 s the specs allow a page's first load (the page loads the addon VM); with the default 30 s a test
  // could fail before its own wait ran out.
  timeout: 120_000,
  // Seeds the spell databases the server uses (in DATA_DIR) from fixtures (no network in tests), and the server's
  // option references from the generated cache (tests/support/e2e-server.ts).
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    // A production build, as the user's server runs: pages are compiled once by the build (about 10 s, less when
    // little changed) instead of on each first request, and React runs without its development checks; the whole
    // run takes about half the time and a third of the CPU of `next dev`. The build type checks, like
    // `npm run typecheck`. E2E_DEV=1 runs the tests against `next dev` instead (e.g. to compare).
    command: process.env.E2E_DEV ? `npx next dev -p ${port}` : `npx next build && npx next start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: e2eServerEnv(port),
  },
});
