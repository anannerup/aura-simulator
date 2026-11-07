/**
 * Real TBC auras from wago.io at seam A (WeakAuras2 5.22.1 with the TBC client profile): raid packs, boss mods, class
 * packs and auras with much custom Lua, recorded in tests/fixtures/wago/tbc (`manifest.json`: name, link, version,
 * why each was chosen, the sha256 of wago's own JSON for it, and the Lua errors classified as the aura's own; what each
 * showed is in .scratch/tbc-anniversary/stress-test.md). For every aura:
 * - its state code decodes, and encodes and decodes to the same aura;
 * - its wago JSON is wago's byte for byte (`lookup/wago/code` → `json`, by hash), and comes back as the same aura;
 * - validation raises no Lua error, except the ones the manifest classifies as the aura's own;
 * - every tab of it and of every aura in it builds (the whole aura loaded into the editor once, each aura selected in
 *   it, as in the game), with no addon error while loading it.
 * The WeakAuras2 zip is downloaded once into .cache/weakauras2; without it (offline) these skip.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { fromWagoJson, loadAddon, toWagoJson, type AuraCore, type AuraState, type OptionNode } from "@/core";
import { currentShard, isFirstShard, shardUnits } from "../../tests/support/shards";
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

const same = (a: AuraState, b: AuraState) => expect({ aura: a.aura, children: a.children }).toStrictEqual({ aura: b.aura, children: b.children });

// The auras are split between the shards of `npm run test:all` by size (about how long their checks take).
const shard = currentShard();
const mine = shardUnits(MANIFEST, (r) => statSync(path.join(DIR, `${r.id}.txt`)).size, shard);

describe.each(mine)("$name (wago $id)", (recorded) => {
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
    const problems: string[] = [];
    for (const aura of [state.aura, ...state.children]) {
      const selected = String(aura.id);
      const opened = await c.options(state, { selected });
      if (opened.warning) problems.push(`loading: ${opened.warning}`);
      for (const { key } of opened.tabs) {
        // (Opening built the first tab already.)
        const r = key === opened.tab ? opened : await c.options(state, { selected, tab: key });
        if (r.error) problems.push(`${selected} ${key}: ${r.error}`);
      }
    }
    expect([...new Set(problems)]).toEqual([]);
  }, 300_000);
});

/**
 * An aura deep in a pack, opened in the window, has its groups around it as in the game (the editor loads the whole
 * top-level aura and selects the aura in it). [Merfin] Cube Assigner: "Cube Assigner Mark 1" is in the dynamic group
 * "[Merfin] Cube Assigner Marks", itself in the top-level group.
 */
describe.runIf(isFirstShard(shard))("a nested child of a real pack in the editor", () => {
  const CHILD = "Cube Assigner Mark 1";
  const PARENT = "[Merfin] Cube Assigner Marks";
  const pack = (c: AuraCore) => c.decode(readFileSync(path.join(DIR, "a7mRKvNf8.txt"), "utf8").trim());
  const find = (tree: OptionNode | undefined, key: string) => {
    const walk = (n: OptionNode): OptionNode | undefined => (n.key === key || n.key?.endsWith(`.${key}`) ? n : n.args?.map(walk).find(Boolean));
    return tree && walk(tree);
  };

  test("loads with no addon error, and its tabs are built with its dynamic group present", async (ctx) => {
    const c = tbc(ctx);
    const state = pack(c);
    expect(state.children.find((a) => a.id === CHILD)?.parent).toBe(PARENT);
    const first = await c.options(state, { selected: CHILD });
    expect(first).toMatchObject({ selected: CHILD, tabs: expect.arrayContaining([expect.objectContaining({ key: "region" })]) });
    expect(first.warning).toBeUndefined();
    expect(first.tabs.map((t) => t.key)).not.toContain("group");
    for (const { key } of first.tabs) expect((await c.options(state, { selected: CHILD, tab: key })).error, key).toBeUndefined();
    // The Display tab's own anchor point is the dynamic group's to decide (CommonOptions' IsParentDynamicGroup):
    // hidden only when the parent is registered.
    const display = await c.options(state, { selected: CHILD, tab: "region" });
    expect(find(display.tree, "selfPoint")?.hidden).toBe(true);
    // The group itself shows the window's Group tab (its grow and spacing options).
    expect((await c.options(state, { selected: PARENT })).tabs[0].key).toBe("group");
  });

  test("reports what the addon raised while adding the pack (in the game, a Lua error)", async (ctx) => {
    const c = tbc(ctx);
    const state = pack(c);
    // A sibling the addon can't add: its dynamic group raises while laying it out.
    const children = state.children.map((a) => (a.id === "Cube Assigner Mark 2" ? { ...a, subRegions: "broken" } : a));
    const r = await c.options({ aura: state.aura, children }, { selected: CHILD, tab: "region" });
    expect(r.warning).toMatch(/Cube Assigner/);
  });

  test("an edit to the child returns the whole pack, with only that change", async (ctx) => {
    const c = tbc(ctx);
    // At this addon version's internalVersion: an aura from an older version comes back migrated whole.
    const state = await c.fillDefaults(pack(c));
    await c.options(state, { selected: CHILD, tab: "region" });
    const edit = await c.setOption(state, { selected: CHILD, tab: "region", path: ["position.width"] }, 77);
    expect(edit).toMatchObject({ changed: true, selected: CHILD });
    expect(edit.state.children).toHaveLength(state.children.length);
    const at = state.children.findIndex((a) => a.id === CHILD);
    expect(edit.state.children[at]).toEqual({ ...state.children[at], width: 77 });
    expect(edit.state.aura).toBe(state.aura);
    edit.state.children.forEach((a, i) => {
      if (i !== at) expect(a).toBe(state.children[i]);
    });
    // The next tab is built for the edited pack without loading it again, and shows the edit.
    const display = await c.options(edit.state, { selected: CHILD, tab: "region" });
    expect(find(display.tree, "width")?.value).toBe(77);
  });
});

describe.runIf(isFirstShard(shard))("custom Lua is flagged where it is", () => {
  test("nanShield (wago G6FHkDAOv, a TSU trigger) gets a custom.lua info per place of its Lua, pointing at it", async (ctx) => {
    const c = tbc(ctx);
    const state = c.decode(readFileSync(path.join(DIR, "G6FHkDAOv.txt"), "utf8").trim());
    const result = await c.validate(state);
    const lua = result.warnings.filter((m) => m.code === "custom.lua");
    expect(lua.map((m) => `${m.auraId} | ${m.pointer?.label} | ${m.message.split(". ")[0]}`)).toEqual([
      "nanShield TBC Anniversary | Display (custom grow) | Custom Lua: custom grow",
      "nanShield:Value | Trigger 1 | Custom Lua: trigger 1: custom (status); trigger",
      "nanShield:Value | Actions (On Init) | Custom Lua: On Init custom code",
      "nanShield:Text | Trigger 1 | Custom Lua: trigger 1: custom (stateupdate); trigger, custom variables",
      "nanShield:Text | Trigger 2 | Custom Lua: trigger 2: custom (event); trigger",
      "nanShield:Text | Actions (On Init) | Custom Lua: On Init custom code",
      "nanShield:Bar | Trigger 1 | Custom Lua: trigger 1: custom (stateupdate); trigger, custom variables",
      "nanShield:Bar | Actions (On Init) | Custom Lua: On Init custom code",
      "nanShield:Segment | Trigger 1 | Custom Lua: trigger 1: custom (stateupdate); trigger, custom variables",
      "nanShield:Segment | Trigger 2 | Custom Lua: trigger 2: custom (event); trigger",
      "nanShield:Segment | Condition 1, change 1 (customcode) | Custom Lua: condition 1: Run Custom Code",
      "nanShield:Segment | Actions (On Init) | Custom Lua: On Init custom code",
    ]);
    // Info, not a warning: imported packs legitimately have Lua.
    expect(lua.every((m) => m.severity === "info")).toBe(true);
    expect(lua[0].message).toMatch(/preview doesn't evaluate it; check it in game\. Where the addon has a built-in way/);
    expect(lua[1].pointer).toMatchObject({ tab: "trigger", trigger: 1, path: ["triggers", 1, "trigger"] });
    expect(result.errors.filter((m) => m.code === "custom.lua")).toEqual([]);
  }, 120_000);
});
