import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_ADDON_REF, loadAddon, sampleIconAura, type AuraCore, type AuraDocument } from "@/core";
import {
  addSubtree,
  allIds,
  duplicateNode,
  findNode,
  mergeTopLevel,
  moveNode,
  newUid,
  placeNewItem,
  nodeFromState,
  nodeId,
  readWorkspace,
  removeNode,
  renameNode,
  serializeWorkspace,
  stateFromNode,
  traverse,
  TreeError,
  updateNode,
  updateWithDescendants,
  type WorkspaceNode,
} from "@/workspace";
import { cachedAddonFetcher } from "../support/addon-source";

const V = 92;
const aura = (id: string): WorkspaceNode => ({ aura: { ...sampleIconAura(V), id, uid: newUid() } });
const group = (id: string, regionType: "group" | "dynamicgroup"): WorkspaceNode => ({
  aura: { id, uid: newUid(), internalVersion: V, regionType, controlledChildren: {} },
  items: [],
});

/** Every link the addon relies on: unique ids, controlledChildren = child ids, parent = group id. */
function expectConsistent(items: WorkspaceNode[]) {
  const ids = Array.from(traverse(items), nodeId);
  expect(new Set(ids).size).toBe(ids.length);
  for (const top of items) expect("parent" in top.aura).toBe(false);
  for (const n of traverse(items)) {
    if (n.items) {
      const cc = n.aura.controlledChildren;
      expect(n.items.length ? cc : {}).toEqual(n.items.length ? n.items.map(nodeId) : cc);
      for (const c of n.items) expect(c.aura.parent).toBe(nodeId(n));
    } else {
      expect("controlledChildren" in n.aura).toBe(false);
    }
  }
}

/** Shape of a tree: ids with nesting. */
const shape = (items: WorkspaceNode[]): unknown[] => items.map((n) => (n.items ? { [nodeId(n)]: shape(n.items) } : nodeId(n)));

function build(): WorkspaceNode[] {
  let items: WorkspaceNode[] = [];
  items = addSubtree(items, group("G", "group"), { parentId: null }).items;
  items = addSubtree(items, aura("A"), { parentId: "G" }).items;
  items = addSubtree(items, aura("B"), { parentId: "G" }).items;
  items = addSubtree(items, group("D", "dynamicgroup"), { parentId: null }).items;
  items = addSubtree(items, aura("C"), { parentId: null }).items;
  return items;
}

describe("workspace tree operations", () => {
  it("adds and nests, keeping controlledChildren and parent in step", () => {
    const items = build();
    expect(shape(items)).toEqual([{ G: ["A", "B"] }, { D: [] }, "C"]);
    expectConsistent(items);
    expect(findNode(items, "G")!.node.aura.controlledChildren).toEqual(["A", "B"]);
    expect(findNode(items, "A")!.node.aura.parent).toBe("G");
    expect(findNode(items, "D")!.node.aura.controlledChildren).toEqual({});
  });

  it("gives clashing ids the addon's 'name 2' and clashing uids a new uid", () => {
    let items = build();
    const copy = findNode(items, "A")!.node;
    const added = addSubtree(items, copy, { parentId: null });
    items = added.items;
    expect(added.id).toBe("A 2");
    expect(findNode(items, "A 2")!.node.aura.uid).not.toBe(copy.aura.uid);
    expectConsistent(items);
  });

  it("renames, updating the group's controlledChildren and the children's parent", () => {
    let items = renameNode(build(), "G", "Buffs");
    items = renameNode(items, "A", "Arcane");
    expect(shape(items)).toEqual([{ Buffs: ["Arcane", "B"] }, { D: [] }, "C"]);
    expect(findNode(items, "B")!.node.aura.parent).toBe("Buffs");
    expectConsistent(items);
    expect(() => renameNode(items, "B", "C")).toThrow(TreeError);
    expect(() => renameNode(items, "B", "  ")).toThrow(/empty/);
  });

  it("moves to nest, un-nest and reorder, and refuses impossible moves", () => {
    let items = build();
    items = moveNode(items, "C", { parentId: "D" });
    items = moveNode(items, "A", { parentId: null, index: 0 });
    items = moveNode(items, "B", { parentId: "D", index: 0 });
    expect(shape(items)).toEqual(["A", { G: [] }, { D: ["B", "C"] }]);
    expectConsistent(items);
    expect(() => moveNode(items, "G", { parentId: "D" })).toThrow(/dynamic group/);
    items = addSubtree(items, group("Inner", "group"), { parentId: "G" }).items;
    expect(() => moveNode(items, "G", { parentId: "Inner" })).toThrow(/itself/);
  });

  it("deletes a subtree and duplicates with fresh ids and uids", () => {
    let items = removeNode(build(), "G");
    expect(shape(items)).toEqual([{ D: [] }, "C"]);
    items = build();
    const dup = duplicateNode(items, "G");
    expect(dup.id).toBe("G 2");
    expect(shape(dup.items)).toEqual([{ G: ["A", "B"] }, { "G 2": ["A 2", "B 2"] }, { D: [] }, "C"]);
    const uids = Array.from(traverse(dup.items), (n) => n.aura.uid);
    expect(new Set(uids).size).toBe(uids.length);
    expectConsistent(dup.items);
  });

  it("updates a document; a changed id is a rename, and links stay derived from the tree", () => {
    const items = build();
    const doc = { ...findNode(items, "A")!.node.aura, id: "Alpha", width: 40, parent: "bogus" };
    const updated = updateNode(items, "A", doc);
    expect(updated.id).toBe("Alpha");
    expect(findNode(updated.items, "Alpha")!.node.aura).toMatchObject({ width: 40, parent: "G" });
    expect(findNode(updated.items, "G")!.node.aura.controlledChildren).toEqual(["Alpha", "B"]);
    expect(() => updateNode(items, "A", { ...doc, id: "B" })).toThrow(/already/);
    expect(() => updateNode(items, "G", { ...findNode(items, "G")!.node.aura, regionType: "icon" })).toThrow(TreeError);
  });

  it("merges a pushed item: same uid (else id) replaces in place, anything else is appended", () => {
    const items = build();
    const c = findNode(items, "C")!.node;
    const replaced = mergeTopLevel(items, { aura: { ...c.aura, id: "C renamed", width: 10 } });
    expect(shape(replaced.items)).toEqual([{ G: ["A", "B"] }, { D: [] }, "C renamed"]);
    const byId = mergeTopLevel(items, { aura: { ...sampleIconAura(V), id: "C", uid: "other" } });
    expect(shape(byId.items)).toEqual(shape(items));
    const appended = mergeTopLevel(items, aura("E"));
    expect(shape(appended.items)).toEqual([{ G: ["A", "B"] }, { D: [] }, "C", "E"]);
  });

  it("updates a group and its changed descendants in one edit, leaving unchanged ones as they are", () => {
    const items = build();
    const [a, b] = findNode(items, "G")!.node.items!;
    const g = findNode(items, "G")!.node.aura;
    const next = updateWithDescendants(items, "G", { ...g, alpha: 0.5 }, [{ ...a.aura }, { ...b.aura, width: 12 }]);
    expect(next.id).toBe("G");
    expect(findNode(next.items, "G")!.node.aura.alpha).toBe(0.5);
    expect(findNode(next.items, "B")!.node.aura.width).toBe(12);
    expect(findNode(next.items, "A")!.node).toBe(a);
    expectConsistent(next.items);
  });
});

describe("new items", () => {
  const made = { ...sampleIconAura(V), id: "Icon from the addon", width: 40 };

  it("go after the selection, or at the end with nothing selected, named New with a fresh uid", () => {
    const end = placeNewItem(build(), null, made);
    expect(end.id).toBe("New");
    expect(shape(end.items).at(-1)).toBe("New");
    expect(typeof findNode(end.items, "New")!.node.aura.uid).toBe("string");
    const after = placeNewItem(end.items, "C", made);
    expect(after.id).toBe("New 2");
    expect(shape(after.items)).toEqual([{ G: ["A", "B"] }, { D: [] }, "C", "New 2", "New"]);
  });

  it("go into a selected group, beside the children already there", () => {
    const placed = placeNewItem(build(), "G", made);
    expect(shape(placed.items)[0]).toEqual({ G: ["A", "B", "New"] });
    expect(findNode(placed.items, "New")!.node.aura.xOffset).toBe(2 * (40 + 4));
    expectConsistent(placed.items);
  });

  it("a new group is an empty group; next to a dynamic group's child it goes to the top level", () => {
    let items = moveNode(build(), "C", { parentId: "D" });
    const placed = placeNewItem(items, "C", { id: "x", regionType: "group" });
    items = placed.items;
    expect(shape(items)).toEqual([{ G: ["A", "B"] }, { D: ["C"] }, { New: [] }]);
    expect(findNode(items, "New")!.node.aura.controlledChildren).toEqual({});
  });
});

describe("state codes and the workspace file", () => {
  let core: AuraCore;
  beforeAll(async () => {
    core = await loadAddon(DEFAULT_ADDON_REF, { fetchSource: cachedAddonFetcher(DEFAULT_ADDON_REF) });
  });

  function nested(): WorkspaceNode[] {
    let items = build();
    items = addSubtree(items, group("Inner", "group"), { parentId: "G" }).items;
    items = moveNode(items, "C", { parentId: "Inner" });
    return items; // G: [A, B, Inner: [C]], D: []
  }

  it("a group's state code holds its descendants in TraverseAllChildren order and rebuilds the same subtree", () => {
    const items = nested();
    const g = findNode(items, "G")!.node;
    const state = stateFromNode(g);
    expect(state.children.map((c) => c.id)).toEqual(["A", "B", "Inner", "C"]);
    const decoded = core.decode(core.encode(state));
    expect(decoded.transmissionVersion).toBe(2000);
    const rebuilt = nodeFromState(decoded);
    expect(rebuilt).toEqual(g);
  });

  it("a code without sub groups (v1421) nests every child directly, as the addon's import does", () => {
    const items = build();
    const g = findNode(items, "G")!.node;
    // As the game exports it: controlledChildren and parent stripped (non_transmissable_fields).
    const strip = (d: AuraDocument) => {
      const rest = { ...d };
      delete rest.controlledChildren;
      delete rest.parent;
      return rest;
    };
    const state = stateFromNode(g);
    const code = core.encode({ aura: strip(state.aura), children: state.children.map(strip) });
    expect(core.decode(code).transmissionVersion).toBe(1421);
    expect(nodeFromState(core.decode(code))).toEqual(g);
  });

  it("round-trips the workspace file losslessly", () => {
    const items = nested();
    const ws = { items, updatedAt: "2026-11-06T10:00:00.000Z", selected: "Inner" };
    const text = serializeWorkspace(ws, { pretty: true });
    const json = JSON.parse(text);
    expect(json).toMatchObject({ format: "aura-simulator/workspace", version: 2 });
    expect(json.items[0].items[2].items[0].aura.id).toBe("C");
    const read = readWorkspace(text);
    expect(read.ok && read.workspace).toEqual(ws);

    // Top-level items may carry their state code; the documents still decide.
    const withCodes = serializeWorkspace(ws, { codeOf: (n) => core.encode(stateFromNode(n)) });
    const again = readWorkspace(withCodes);
    expect(again.ok && again.workspace).toEqual(ws);
    expect(again.ok && again.codes.map((c) => nodeFromState(core.decode(c)))).toEqual(items);
  });

  it("rejects broken files with a reason", () => {
    const file = (items: unknown) => JSON.stringify({ format: "aura-simulator/workspace", version: 2, items });
    const icon = (id: string) => ({ aura: { id, regionType: "icon" } });
    expect(readWorkspace(file([icon("A"), icon("A")]))).toMatchObject({ ok: false, error: /twice/ });
    expect(readWorkspace(file([{ aura: { id: "A", regionType: "icon" }, items: [] }]))).toMatchObject({ ok: false });
    expect(
      readWorkspace(file([{ aura: { id: "D", regionType: "dynamicgroup" }, items: [{ aura: { id: "G", regionType: "group" } }] }])),
    ).toMatchObject({ ok: false, error: /dynamic group/ });
    expect(readWorkspace(file([{ aura: { regionType: "icon" } }]))).toMatchObject({ ok: false, error: /id/ });
    expect(readWorkspace("[]")).toMatchObject({ ok: false });
  });

  it("migrates a version 1 workspace (one state code per item) by decoding each code", () => {
    const items = nested();
    const codes = items.map((n) => core.encode(stateFromNode(n)));
    const v1 = JSON.stringify({
      format: "aura-simulator/workspace",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      items: [...codes.map((code) => ({ code })), { code: "!WA:2!broken" }],
    });
    const read = readWorkspace(v1, (c) => core.decode(c));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.workspace.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(read.workspace.items).toEqual(items);
    expect(allIds(read.workspace.items).size).toBe(6);
    // The migrated workspace is stored as version 2 from then on.
    expect(JSON.parse(serializeWorkspace(read.workspace)).version).toBe(2);
    expect(readWorkspace(v1)).toMatchObject({ ok: false });
  });
});
