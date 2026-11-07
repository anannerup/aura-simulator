/**
 * Real TBC auras from wago.io at seam A (WeakAuras2 5.22.1 with the TBC client profile): raid packs, boss mods, class
 * packs and auras with much custom Lua, recorded in tests/fixtures/wago/tbc (`manifest.json`: name, link, version,
 * why each was chosen, the sha256 of wago's own JSON for it, and the Lua errors classified as the aura's own; what each
 * showed is in .scratch/tbc-anniversary/stress-test.md). For every aura:
 * - its state code decodes, and encodes and decodes to the same aura;
 * - its wago JSON is wago's byte for byte (`lookup/wago/code` → `json`, by hash), and comes back as the same aura;
 * - validation raises no Lua error, except the ones the manifest classifies as the aura's own;
 * - every tab of it and of every aura in it builds, with no addon error while loading it into the editor.
 * The WeakAuras2 zip is downloaded once into .cache/weakauras2; without it (offline) these skip.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { fromWagoJson, loadAddon, toWagoJson, type AuraCore, type AuraDocument, type AuraState } from "@/core";
import { TBC_TEST_VERSION, weakAuras2Available, weakAuras2Fetcher } from "../../tests/support/weakauras2";

const DIR = path.resolve(__dirname, "../../tests/fixtures/wago/tbc");

interface RecordedAura {
  id: string;
  name: string;
  wagoJsonSha256: string;
  /** Lua errors that are the aura's own (it raises them in the game too), with why. */
  luaErrors?: { aura: string; code: string; message: string; why: string }[];
}
const MANIFEST = JSON.parse(readFileSync(path.join(DIR, "manifest.json"), "utf8")) as RecordedAura[];

/** Validation codes for a Lua error raised while the simulated client runs the aura. */
const LUA_ERROR_CODES = new Set(["addon.LuaError", "add.error", "defaults.error"]);

let core: AuraCore | undefined;
beforeAll(async () => {
  if (!(await weakAuras2Available())) return;
  core = await loadAddon(TBC_TEST_VERSION, { fetchSource: weakAuras2Fetcher(), game: "tbc" });
}, 120_000);
afterAll(() => core?.dispose());

function tbc(ctx: { skip: () => void }): AuraCore {
  if (!core) ctx.skip();
  return core!;
}

/** What the window opens for one aura of a group: the aura and its descendants (as the page selects it). */
function selection(all: AuraDocument[], aura: AuraDocument): AuraState {
  const byId = new Map(all.map((a) => [a.id, a]));
  const children: AuraDocument[] = [];
  const walk = (a: AuraDocument) => {
    // An empty controlledChildren is an empty table ({}), not a list.
    for (const id of Array.isArray(a.controlledChildren) ? (a.controlledChildren as string[]) : []) {
      const child = byId.get(id);
      if (!child) continue;
      children.push(child);
      walk(child);
    }
  };
  walk(aura);
  return { aura, children };
}

const same = (a: AuraState, b: AuraState) => expect({ aura: a.aura, children: a.children }).toStrictEqual({ aura: b.aura, children: b.children });

describe.each(MANIFEST)("$name (wago $id)", (recorded) => {
  const code = () => readFileSync(path.join(DIR, `${recorded.id}.txt`), "utf8").trim();

  test("round-trips as a state code and as wago's own JSON", (ctx) => {
    const c = tbc(ctx);
    const state = c.decode(code());
    same(c.decode(c.encode(state)), state);
    const json = toWagoJson(state, { format: "compact" });
    expect(createHash("sha256").update(json).digest("hex")).toBe(recorded.wagoJsonSha256);
    same(c.decode(c.encode(fromWagoJson(json))), state);
  });

  test("validates without Lua errors (except the aura's own)", async (ctx) => {
    const c = tbc(ctx);
    const result = await c.validate(c.decode(code()));
    const luaErrors = [...result.errors, ...result.warnings]
      .filter((m) => LUA_ERROR_CODES.has(m.code))
      .map((m) => ({ aura: m.auraId ?? recorded.name, code: m.code, message: m.message }));
    const expected = (recorded.luaErrors ?? []).map((e) => ({ aura: e.aura, code: e.code, message: expect.stringContaining(e.message) }));
    expect(luaErrors).toEqual(expected);
  }, 120_000);

  test("every tab of every aura in it builds", async (ctx) => {
    const c = tbc(ctx);
    const state = c.decode(code());
    const all = [state.aura, ...state.children];
    const problems: string[] = [];
    for (const aura of all) {
      const opened = selection(all, aura);
      for (const { key } of (await c.options(opened)).tabs) {
        const r = await c.options(opened, { tab: key });
        if (r.error) problems.push(`${String(aura.id)} ${key}: ${r.error}`);
        if (r.warning) problems.push(`${String(aura.id)} ${key}: ${r.warning}`);
      }
    }
    expect(problems).toEqual([]);
  }, 300_000);
});
