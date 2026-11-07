/** Buttons that open one of the options window's dialogs: the page gets what to show and answers with the same button. */
import { beforeAll, expect, test } from "vitest";
import { loadAddon, type AuraCore, type AuraDocument, type AuraState, type OptionNode, type OptionsTree } from "@/core";
import { cachedAddonFetcher } from "../../tests/support/addon-source";
import { walkOptions } from "../../tests/support/options-sweep";

const REF = "v1.15.0";
let core: AuraCore;

beforeAll(async () => {
  core = await loadAddon(REF, { fetchSource: cachedAddonFetcher(REF) });
  await core.loadFullAddon();
}, 120_000);

const state = async (regionType: string): Promise<AuraState> => ({ aura: { ...(await core.newAura(regionType)), id: "Dialogs" }, children: [] });
const find = (tree: OptionsTree, test: (n: OptionNode) => boolean) => walkOptions(tree.tree!).find(test)!;

test("Manual Icon's Choose opens the icon picker; the choice sets the icon", async () => {
  const s = await state("icon");
  const tree = await core.options(s, { tab: "region" });
  const choose = find(tree, (n) => n.type === "execute" && n.key === "icon.chooseIcon");
  expect(choose).toBeDefined();
  const asked = await core.setOption(s, { tab: "region", path: choose.path });
  expect(asked.dialog).toMatchObject({ kind: "icon" });
  expect(asked.changed).toBe(false);
  const chosen = await core.setOption(s, { tab: "region", path: choose.path }, "Interface\\Icons\\Spell_Holy_MagicalSentry");
  expect(chosen.changed).toBe(true);
  expect(chosen.dialog).toBeUndefined();
  expect(chosen.state.aura.displayIcon).toBe("Interface\\Icons\\Spell_Holy_MagicalSentry");
});

test("a texture's Choose opens the texture picker with the addon's texture lists", async () => {
  const s = await state("texture");
  const tree = await core.options(s, { tab: "region" });
  const choose = find(tree, (n) => n.type === "execute" && /choose/i.test(n.key));
  const asked = await core.setOption(s, { tab: "region", path: choose.path });
  expect(asked.dialog?.kind).toBe("texture");
  if (asked.dialog?.kind !== "texture") return;
  expect(asked.dialog.categories.length).toBeGreaterThan(1);
  const [path] = asked.dialog.categories[0].textures[0];
  const chosen = await core.setOption(s, { tab: "region", path: choose.path }, path);
  expect(chosen.state.aura[asked.dialog.property!]).toBe(path);
});

test("deleting a trigger asks first, and deletes once confirmed", async () => {
  let s = await state("icon");
  const add = find(await core.options(s, { tab: "trigger" }), (n) => n.type === "execute" && /Add Trigger/.test(n.name ?? ""));
  s = (await core.setOption(s, { tab: "trigger", path: add.path })).state;
  const tree = await core.options(s, { tab: "trigger" });
  const del = find(tree, (n) => n.type === "execute" && /^trigger\.2\..*deleteButton$/.test(n.key));
  const asked = await core.setOption(s, { tab: "trigger", path: del.path });
  expect(asked.dialog).toMatchObject({ kind: "confirm" });
  expect(asked.changed).toBe(false);
  const done = await core.setOption(s, { tab: "trigger", path: del.path }, true);
  expect(done.changed).toBe(true);
  const count = (a: AuraDocument) => Object.keys(a.triggers as AuraDocument).filter((k) => /^\[\d+\]$/.test(k)).length;
  expect(count(s.aura)).toBe(2);
  expect(count(done.state.aura)).toBe(1);
});

test("a group's Trigger tab edits its children, and the edit returns them", async () => {
  const child = { ...(await core.newAura("icon")), id: "Kid", parent: "Grp" };
  const group = { ...(await core.newAura("group")), id: "Grp", controlledChildren: ["Kid"] };
  const s = { aura: group, children: [child] };
  const tree = await core.options(s, { tab: "trigger" });
  const unit = find(tree, (n) => n.type === "select" && /\.unit$/.test(n.key) && !n.hidden);
  const other = unit.values!.find(([k]) => k !== unit.value)![0];
  const edit = await core.setOption(s, { tab: "trigger", path: unit.path }, other);
  expect(edit.changed).toBe(true);
  expect(edit.state.children).toHaveLength(1);
  expect(JSON.stringify(edit.state.children[0].triggers)).toContain(JSON.stringify(other));
});
