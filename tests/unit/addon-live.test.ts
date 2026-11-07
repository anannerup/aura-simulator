import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { createAddonSourceCache } from "@/server/addon";
import { FOREVER_ADDON } from "@/games/forever/sources";

/**
 * Opt-in live smoke test (LIVE=1 npm test -- addon-live): the real GitHub and jsDelivr still answer
 * the way the recorded fixtures in tests/fixtures/forever/addon say, and the source cache resolves releases against
 * them. Every other test, and the e2e dev server (ADDON_UPSTREAM_FIXTURES in
 * playwright.config.ts), uses the fixtures. Needs GitHub's API (60 requests/hour unauthenticated;
 * GITHUB_TOKEN raises it).
 */
const fixtures = path.resolve(__dirname, "../fixtures/forever/addon");
const recordedTags = JSON.parse(readFileSync(path.join(fixtures, "github-tags.json"), "utf8")) as {
  name: string;
  commit: { sha: string };
}[];

describe.skipIf(!process.env.LIVE)("live GitHub and jsDelivr", () => {
  const root = mkdtempSync(path.join(tmpdir(), "addon-live-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test("version list and tags resolve as recorded", async () => {
    const cache = createAddonSourceCache({ ...FOREVER_ADDON, root });
    const list = await cache.versions();
    expect(list.tagsConfirmed, "GitHub's tag list (rate limited?)").toBe(true);
    expect(list.releases.length).toBeGreaterThan(0);

    // Recorded tags still point at the same commits (tags don't move).
    const v115 = recordedTags.find((t) => t.name === "v1.15.0")!;
    expect(await cache.resolve("1.15.0")).toMatchObject({ ref: "v1.15.0", sha: v115.commit.sha });
    expect(await cache.readText("v1.15.0", "WeakAuras/Init.lua")).toMatch(/^local versionString = "5\.22\.0"/m);
  }, 120_000);
});
