import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuraDocument, AuraState, OptionNode } from "@/core";
import { OptionEdits, optionId, type OptionEditsDeps } from "@/components/options-editor/option-edits";

const node = (type: string, path: string[], value?: unknown) => ({ type, path, value, name: path.join(".") }) as unknown as OptionNode;
const doc = (fields: Record<string, unknown>) => ({ id: "A", ...fields }) as AuraDocument;
const settled = () => new Promise((r) => setTimeout(r, 0));

/** A fake VM: setOption writes `value` at the option's last path key. */
function setup(onChange: OptionEditsDeps["onChange"] = () => undefined) {
  const calls: { state: AuraState; value: unknown }[] = [];
  const deps: OptionEditsDeps = {
    setOption: async (state, address, value) => {
      calls.push({ state, value });
      const aura = { ...state.aura, [address.path.at(-1)!]: value } as AuraDocument;
      return { changed: true, aura, children: state.children } as Awaited<ReturnType<OptionEditsDeps["setOption"]>>;
    },
    onChange,
  };
  const edits = new OptionEdits(deps, { aura: doc({}), children: [] });
  return { edits, calls };
}

afterEach(() => vi.useRealTimers());

describe("OptionEdits", () => {
  it("queues edits so each applies to the result of the one before", async () => {
    const { edits, calls } = setup();
    edits.edit("region", node("input", ["a"]), 1);
    edits.edit("region", node("input", ["b"]), 2);
    expect(edits.getView().pending).toBe(2);
    await settled();
    expect(calls[1].state.aura).toMatchObject({ a: 1 });
    expect(edits.getView().pending).toBe(0);
    expect(edits.getView().drafts[optionId(["b"])]).toEqual({ value: 2, done: true });
    edits.treeBuilt();
    expect(edits.getView().drafts).toEqual({});
  });

  it("rolls back and rebuilds when the page refuses the change", async () => {
    const { edits, calls } = setup((aura) => ((aura as { a?: unknown }).a === "bad" ? { ok: false, error: "no" } : undefined));
    edits.edit("region", node("input", ["a"]), "bad");
    edits.edit("region", node("input", ["b"]), 2);
    await settled();
    expect(calls[1].state.aura).not.toHaveProperty("a");
    expect(edits.getView().errors[optionId(["a"])]).toBe("no");
    expect(edits.getView().rebuilds).toBe(1);
  });

  it("applies only the last of a continuous run", async () => {
    vi.useFakeTimers();
    const { edits, calls } = setup();
    const slider = node("range", ["w"]);
    for (const v of [1, 2, 3]) edits.edit("region", slider, v, { continuous: true });
    expect(edits.getView().drafts[optionId(["w"])].value).toBe(3);
    await vi.runAllTimersAsync();
    expect(calls.map((c) => c.value)).toEqual([3]);
  });

  it("shows a multiselect edit as the whole list with one pair changed", () => {
    const { edits } = setup();
    const multi = node("multiselect", ["m"], [["x", false], ["y", true]]);
    edits.edit("load", multi, ["x", true]);
    edits.edit("load", multi, ["y", false]);
    expect(edits.getView().drafts[optionId(["m"])].value).toEqual([["x", true], ["y", false]]);
  });
});
