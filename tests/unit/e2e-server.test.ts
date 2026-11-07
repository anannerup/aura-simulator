/**
 * The e2e global setup seeds the e2e server's option references where the server keeps them, working that out
 * without the server's own modules (Playwright can't load the aura core): it must agree with the server.
 */
import { expect, test } from "vitest";
import { findServerGame } from "@/games/server";
import { optionReferenceFile } from "@/server/option-reference";
import { e2eOptionReferenceFiles, e2eServerEnv } from "../support/e2e-server";

test("the e2e setup's option reference files are the e2e server's", async () => {
  // The unit tests' server has the e2e server's addon folders and recorded answers (vitest.config.ts).
  const addonEnv = ["ADDON_UPSTREAM_FIXTURES", "ADDON_CACHE_DIR", "ADDON_CACHE_DIR_TBC"];
  const e2e = e2eServerEnv(0);
  for (const key of addonEnv) expect(process.env[key], key).toBe(e2e[key]);
  const files = await e2eOptionReferenceFiles();
  expect(files.map((f) => f.game).sort()).toEqual(["forever", "tbc"]);
  for (const { game, file, ref } of files) expect({ file, ref }).toEqual(await optionReferenceFile(findServerGame(game)!));
});
