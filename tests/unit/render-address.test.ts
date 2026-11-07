import { describe, expect, it } from "vitest";
import { PendingWork } from "@/lib/pending";
import { buildRenderUrl, DEFAULT_RENDER_OPTIONS, readRenderOptions, readRenderWorkspace, RenderOptionsError } from "@/workspace";

const read = (query: string) => readRenderOptions(new URLSearchParams(query));

describe("render options", () => {
  it("defaults to the latest push at 1 px per UI unit, unpadded, transparent, in the workspace's situation", () => {
    expect(read("")).toEqual(DEFAULT_RENDER_OPTIONS);
    expect(readRenderWorkspace(new URLSearchParams(""))).toBe("default");
  });

  it("reads every option", () => {
    expect(read("aura=Fire%20Blast&scale=1.125&padding=12&background=203040&situation=%7B%7D&ref=5.22.1")).toEqual({
      aura: "Fire Blast",
      scale: 1.125,
      padding: 12,
      background: "#203040",
      situation: "{}",
      ref: "5.22.1",
    });
    expect(read("background=transparent").background).toBeNull();
    expect(read("background=%2300000080").background).toBe("#00000080");
  });

  it("says what is wrong", () => {
    for (const [query, message] of [
      ["scale=0", /scale must be a number above 0 up to 8/],
      ["scale=9", /scale/],
      ["scale=x", /scale/],
      ["padding=-1", /padding must be a number from 0/],
      ["background=red", /background must be/],
    ] as const) {
      expect(() => read(query), query).toThrow(RenderOptionsError);
      expect(() => read(query), query).toThrow(message);
    }
    expect(() => readRenderWorkspace(new URLSearchParams("w=a%20b"))).toThrow(RenderOptionsError);
  });

  it("builds the page address back from the options, leaving out defaults", () => {
    const url = new URL(buildRenderUrl("http://localhost:3000/", "tbc", "ws", { aura: "A B", scale: 2, background: "#000000" }));
    expect(url.pathname).toBe("/tbc/render");
    expect(Object.fromEntries(url.searchParams)).toEqual({ aura: "A B", scale: "2", background: "#000000", w: "ws" });
    expect(readRenderOptions(url.searchParams)).toEqual({ ...DEFAULT_RENDER_OPTIONS, aura: "A B", scale: 2, background: "#000000" });
  });
});

describe("PendingWork", () => {
  it("is idle once everything it tracked has settled, failures too", async () => {
    const pending = new PendingWork();
    await pending.idle();
    let ok!: () => void;
    let fail!: (e: Error) => void;
    pending.track(new Promise<void>((resolve) => (ok = resolve)));
    pending.track(new Promise<void>((_, reject) => (fail = reject))).catch(() => {});
    expect(pending.count).toBe(2);
    let idle = false;
    const waiting = pending.idle().then(() => (idle = true));
    ok();
    await Promise.resolve();
    expect(idle).toBe(false);
    fail(new Error("gone"));
    await waiting;
    expect(pending.count).toBe(0);
  });
});
