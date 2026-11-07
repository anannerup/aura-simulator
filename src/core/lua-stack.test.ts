/**
 * Every call into a Lua VM leaves its stack as it found it (`runLua`). wasmoon's doStringSync leaves a chunk's results
 * on the stack, so it grew by one per call until wasmoon wrote past its end and corrupted the VM: validating a big pack
 * (one call per aura) and then loading it into the editor failed with errors such as "attempt to call method
 * 'IsVisible' (a nil value)" (.scratch/test-speed/issues/02-validate-before-first-options-breaks-editor.md).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { loadAddon, type AuraCore } from "@/core";
import { TBC_TEST_VERSION, weakAuras2Available, weakAuras2Fetcher } from "../../tests/support/weakauras2";

let core: AuraCore | undefined;
beforeAll(async () => {
  if (await weakAuras2Available()) core = await loadAddon(TBC_TEST_VERSION, { fetchSource: weakAuras2Fetcher(), game: "tbc" });
}, 120_000);
afterAll(() => core?.dispose());

test("a pack validated first loads into the editor (Tems' TBC Dungeons WA Pack, 155 auras)", async (ctx) => {
  if (!core) return ctx.skip();
  const pack = core.decode(readFileSync(path.resolve(__dirname, "../../tests/fixtures/wago/tbc/PA-hKPPtc.txt"), "utf8").trim());
  await core.validate(pack);
  const opened = await core.options(pack, { selected: String(pack.aura.id) });
  expect(opened.warning).toBeUndefined();
  for (const { key } of opened.tabs) expect((await core.options(pack, { selected: String(pack.aura.id), tab: key })).error, key).toBeUndefined();
}, 120_000);
