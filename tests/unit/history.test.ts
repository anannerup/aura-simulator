import { describe, expect, test } from "vitest";
import { EMPTY_HISTORY, canRedo, canUndo, current, record, redo, undo, type History } from "@/workspace";

const recordAll = (codes: string[], h: History<string> = EMPTY_HISTORY) => codes.reduce((acc, c) => record(acc, c), h);

describe("undo history", () => {
  test("the first code is the baseline: nothing to undo yet", () => {
    const h = record(EMPTY_HISTORY, "a");
    expect(current(h)).toBe("a");
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  test("every new code is a step; the same code again is not", () => {
    const h = recordAll(["a", "b", "b", "c"]);
    expect(h.entries).toEqual(["a", "b", "c"]);
    expect(record(h, "c")).toBe(h);
  });

  test("undo and redo move the cursor; loading the code at the cursor adds nothing", () => {
    let h = recordAll(["a", "b", "c"]);
    h = undo(h)!;
    expect(current(h)).toBe("b");
    expect(record(h, "b")).toBe(h); // the page shows the undone-to code
    h = undo(h)!;
    expect(current(h)).toBe("a");
    expect(undo(h)).toBeNull();
    h = redo(redo(h)!)!;
    expect(current(h)).toBe("c");
    expect(redo(h)).toBeNull();
  });

  test("a change after undo (from any source, e.g. an agent push) drops the redo branch", () => {
    let h = recordAll(["a", "b", "c"]);
    h = undo(undo(h)!)!;
    h = record(h, "pushed");
    expect(h.entries).toEqual(["a", "pushed"]);
    expect(canRedo(h)).toBe(false);
    expect(current(undo(h)!)).toBe("a");
  });

  test("keeps at most the limit, dropping the oldest", () => {
    const h = recordAll(["1", "2", "3", "4", "5"].map(String)).entries.length;
    expect(h).toBe(5);
    let small: History<string> = EMPTY_HISTORY;
    for (const c of ["1", "2", "3", "4"]) small = record(small, c, Object.is, 3);
    expect(small.entries).toEqual(["2", "3", "4"]);
    expect(current(small)).toBe("4");
  });

  test("an entry shown again (a new object with the same parts) is not a new step", () => {
    type Snap = { items: object; selectedId: string };
    const same = (a: Snap, b: Snap) => a.items === b.items && a.selectedId === b.selectedId;
    const one = {};
    let h = record<Snap>(EMPTY_HISTORY, { items: one, selectedId: "a" }, same);
    h = record(h, { items: {}, selectedId: "a" }, same);
    h = undo(h)!;
    expect(record(h, { items: one, selectedId: "a" }, same)).toBe(h);
    expect(canRedo(h)).toBe(true);
  });
});
