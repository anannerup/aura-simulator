import { describe, expect, it } from "vitest";
import { PendingWork } from "@/lib/pending";
import {
  buildFontSampleUrl,
  buildRenderUrl,
  DEFAULT_FONT_SAMPLE,
  DEFAULT_RENDER_OPTIONS,
  readFontSampleOptions,
  readRenderOptions,
  readRenderWorkspace,
  RenderOptionsError,
} from "@/workspace";

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

describe("font sample options", () => {
  const sample = (query: string) => readFontSampleOptions(new URLSearchParams(query));

  it("needs a font, defaults the rest, and reads every option", () => {
    expect(() => sample("")).toThrow(/font is required/);
    expect(sample("font=Arial+Narrow")).toEqual({ font: "Arial Narrow", ...DEFAULT_FONT_SAMPLE });
    expect(sample("font=PT+Sans+Narrow+Bold&text=12&size=12&outline=None&shadowX=1&shadowY=-1&colour=ffd100&scale=1.40625&background=000&ref=5.22.1")).toEqual({
      font: "PT Sans Narrow Bold",
      text: "12",
      size: 12,
      outline: "None",
      shadowX: 1,
      shadowY: -1,
      colour: "#ffd100",
      scale: 1.40625,
      background: "#000",
      ref: "5.22.1",
    });
  });

  it("says what is wrong", () => {
    expect(() => sample("font=a&size=0")).toThrow(RenderOptionsError);
    expect(() => sample("font=a&size=100")).toThrow(/size must be a number above 0 up to 72/);
    expect(() => sample("font=a&colour=red")).toThrow(/colour must be/);
    expect(() => sample(`font=a&text=${"x".repeat(201)}`)).toThrow(/text must be 1 to 200/);
  });

  it("builds the page address back from the options", () => {
    const options = sample("font=Friz+Quadrata+TT&text=0:42&size=14&shadowX=1&shadowY=-1&background=202020");
    const url = buildFontSampleUrl("http://localhost:3000/", "tbc", options);
    expect(url.startsWith("http://localhost:3000/tbc/fonts/sample?")).toBe(true);
    expect(readFontSampleOptions(new URL(url).searchParams)).toEqual(options);
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
