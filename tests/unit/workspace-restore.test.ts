import { describe, expect, it } from "vitest";
import { chooseRestore, nodeId, type Workspace, type WorkspaceNode } from "@/workspace";

const item = (id: string, uid = `uid-${id}`): WorkspaceNode => ({ aura: { id, uid, regionType: "icon" } });
const ids = (items: WorkspaceNode[]) => items.map(nodeId);
const NOW = "2026-11-07T12:00:00.000Z";
const stored: Workspace = { items: [item("A"), item("B")], updatedAt: "2026-11-07T10:00:00.000Z", selected: "B" };
const base = { stored: null, pushed: null, legacy: null, fallback: () => item("Sample"), now: NOW };

describe("restoring a workspace", () => {
  it("shows the fallback when nothing has an aura", () => {
    expect(chooseRestore(base)).toMatchObject({ selected: "Sample", fromServer: false, notice: null });
  });

  it("prefers browser storage when it is newer than the server's latest push", () => {
    const pushed = { node: item("Pushed"), updatedAt: "2026-11-07T09:00:00.000Z" };
    const r = chooseRestore({ ...base, stored, pushed });
    expect(ids(r.items)).toEqual(["A", "B"]);
    expect(r).toMatchObject({ selected: "B", updatedAt: stored.updatedAt, fromServer: false });
  });

  it("merges a push that arrived since the browser last saved, as a live push would", () => {
    const pushed = { node: item("B changed", "uid-B"), updatedAt: "2026-11-07T11:00:00.000Z" };
    const r = chooseRestore({ ...base, stored, pushed });
    expect(ids(r.items)).toEqual(["A", "B changed"]);
    expect(r).toMatchObject({ selected: "B changed", updatedAt: pushed.updatedAt, fromServer: true });
  });

  it("uses the server's push alone when the browser has nothing", () => {
    const pushed = { node: item("Pushed"), updatedAt: "2026-11-07T09:00:00.000Z" };
    expect(chooseRestore({ ...base, pushed })).toMatchObject({ selected: "Pushed", fromServer: true });
  });

  it("imports an old ?code= link once, into what was restored, without the fallback", () => {
    const r = chooseRestore({ ...base, stored, legacy: { node: item("Linked") } });
    expect(ids(r.items)).toEqual(["A", "B", "Linked"]);
    expect(r).toMatchObject({ selected: "Linked", updatedAt: NOW, fromServer: false });
    expect(ids(chooseRestore({ ...base, legacy: { node: item("Linked") } }).items)).toEqual(["Linked"]);
  });

  it("says why an old link doesn't load, and still restores", () => {
    const r = chooseRestore({ ...base, legacy: { error: "bad code" } });
    expect(ids(r.items)).toEqual(["Sample"]);
    expect(r.notice).toMatch(/bad code/);
  });
});
