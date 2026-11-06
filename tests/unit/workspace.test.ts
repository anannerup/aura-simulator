import { describe, expect, it } from "vitest";
import {
  auraFileName,
  buildPageUrl,
  buildSearch,
  classifyImportText,
  extractStateCodes,
  newerWorkspace,
  parseAddress,
  parseWorkspace,
} from "@/workspace";

const CODE = "!WA:2!Tr1ox(TnqKa)pL9";

describe("address", () => {
  it("names only the workspace, and leaves the default out", () => {
    expect(buildSearch("default")).toBe("");
    expect(buildSearch("abc-1")).toBe("?w=abc-1");
    expect(parseAddress("?w=abc-1").workspaceId).toBe("abc-1");
    expect(parseAddress("").workspaceId).toBe("default");
    expect(parseAddress("?w=bad%20id").workspaceId).toBe("default");
    expect(buildPageUrl("http://localhost:3000/", "default")).toBe("http://localhost:3000/");
    expect(buildPageUrl("http://x", "w1")).toBe("http://x/?w=w1");
  });

  it("reports old ?code= and ?s= links so the page can import once and strip them", () => {
    expect(parseAddress(`?w=a&code=${encodeURIComponent(CODE)}`)).toEqual({
      workspaceId: "a",
      legacyCode: CODE,
      legacyShortLink: false,
    });
    expect(parseAddress(`?code=${CODE}`).legacyCode).toBe(CODE);
    expect(parseAddress("?s=Ab12Cd34")).toEqual({ workspaceId: "default", legacyCode: null, legacyShortLink: true });
    expect(parseAddress("?w=a")).toEqual({ workspaceId: "a", legacyCode: null, legacyShortLink: false });
  });
});

describe("import and export files", () => {
  const other = "!WA:2!abc";

  it("finds every state code in a text, one per line or surrounded by other text", () => {
    expect(extractStateCodes(`${CODE}\r\n\n${other}\n`)).toEqual([CODE, other]);
    expect(extractStateCodes(`Here you go: ${CODE}. Enjoy!`)).toEqual([CODE]);
    expect(extractStateCodes(`﻿${CODE}`)).toEqual([CODE]);
    expect(extractStateCodes("nothing here")).toEqual([]);
  });

  it("tells a workspace JSON file from text with codes", () => {
    const ws = JSON.stringify({ format: "aura-simulator/workspace", version: 2, items: [{ aura: { id: "x" }, code: CODE }] });
    expect(classifyImportText(ws)).toEqual({ kind: "workspace", text: ws });
    expect(classifyImportText(`  ${ws}`).kind).toBe("workspace");
    expect(classifyImportText(`${CODE}\n${other}`)).toEqual({ kind: "codes", codes: [CODE, other] });
    // Other JSON still yields the codes in it.
    expect(classifyImportText(JSON.stringify({ codes: [CODE] }))).toEqual({ kind: "codes", codes: [CODE] });
    expect(classifyImportText('{"format": "other"}').kind).toBe("none");
    expect(classifyImportText("hello").kind).toBe("none");
    expect(classifyImportText("").kind).toBe("none");
  });

  it("names aura files after the aura, safe for any file system", () => {
    expect(auraFileName("Arcane Intellect")).toBe("Arcane Intellect.txt");
    expect(auraFileName('a/b\\c:d*e?"f<g>h|')).toBe("a_b_c_d_e__f_g_h_.txt");
    expect(auraFileName("Æble ✨")).toBe("Æble ✨.txt");
    expect(auraFileName("..")).toBe("aura.txt");
    expect(auraFileName("")).toBe("aura.txt");
  });
});

describe("stored workspace", () => {
  it("ignores junk, other formats and non-codes", () => {
    const decode = () => {
      throw new Error("not reached");
    };
    expect(parseWorkspace(null)).toBeNull();
    expect(parseWorkspace("{not json")).toBeNull();
    expect(parseWorkspace(JSON.stringify({ format: "other", version: 1, items: [{ code: CODE }] }))).toBeNull();
    expect(
      parseWorkspace(JSON.stringify({ format: "aura-simulator/workspace", version: 1, items: [{ code: "hello" }] }), decode),
    ).toBeNull();
    expect(parseWorkspace(JSON.stringify({ format: "aura-simulator/workspace", version: 3, items: [] }))).toBeNull();
  });

  it("picks the newer of two", () => {
    const a = { items: [], updatedAt: "2026-01-01T00:00:00Z" };
    const b = { items: [], updatedAt: "2026-01-02T00:00:00Z" };
    expect(newerWorkspace(a, b)).toBe(b);
    expect(newerWorkspace(b, a)).toBe(b);
    expect(newerWorkspace(null, a)).toBe(a);
    expect(newerWorkspace(a, null)).toBe(a);
  });
});
