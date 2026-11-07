import { describe, expect, it } from "vitest";
import { findStateCodes, isStateCode } from "@/core";
import {
  auraFileName,
  buildPageUrl,
  buildSearch,
  classifyImportText,
  newerWorkspace,
  parseWorkspaceId,
  readWorkspace,
  workspaceFileName,
} from "@/workspace";

const CODE = "!WA:2!Tr1ox(TnqKa)pL9";

describe("address", () => {
  it("names the game and only the workspace, and leaves the default out", () => {
    expect(buildSearch("default")).toBe("");
    expect(buildSearch("abc-1")).toBe("?w=abc-1");
    expect(parseWorkspaceId("?w=abc-1")).toBe("abc-1");
    expect(parseWorkspaceId("")).toBe("default");
    expect(parseWorkspaceId("?w=bad%20id")).toBe("default");
    expect(parseWorkspaceId(`?w=a&code=${encodeURIComponent(CODE)}`)).toBe("a");
    expect(buildPageUrl("http://localhost:3000/", "forever", "default")).toBe("http://localhost:3000/forever");
    expect(buildPageUrl("http://x", "forever", "w1")).toBe("http://x/forever?w=w1");
  });
});

describe("import and export files", () => {
  const other = "!WA:2!abc";

  it("finds every state code in a text, one per line or surrounded by other text", () => {
    expect(findStateCodes(`${CODE}\r\n\n${other}\n`)).toEqual([CODE, other]);
    expect(findStateCodes(`Here you go: ${CODE}. Enjoy!`)).toEqual([CODE]);
    expect(findStateCodes(`﻿${CODE}`)).toEqual([CODE]);
    expect(findStateCodes("nothing here")).toEqual([]);
  });

  it("takes the encode versions the addon decodes with LibSerialize (2 and up), not older strings", () => {
    expect(isStateCode(` ${CODE}\n`)).toBe(true);
    expect(isStateCode("!WA:10!abc")).toBe(true);
    expect(isStateCode("!WA:1!abc")).toBe(false);
    expect(isStateCode("!WA:02!abc")).toBe(false);
    expect(isStateCode(`${CODE} trailing`)).toBe(false);
    expect(findStateCodes("!WA:1!abc !WA:0!abc")).toEqual([]);
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

  it("names workspace files after the game and workspace, as .aura-workspace.json", () => {
    expect(workspaceFileName("forever", "default")).toBe("forever-default.aura-workspace.json");
  });
});

describe("stored workspace", () => {
  it("ignores junk, other formats, older versions and other games' workspaces", () => {
    const file = (body: object) => JSON.stringify({ format: "aura-simulator/workspace", items: [], ...body });
    expect(readWorkspace(null, "forever").ok).toBe(false);
    expect(readWorkspace("{not json", "forever").ok).toBe(false);
    expect(readWorkspace(JSON.stringify({ format: "other", version: 3, game: "forever", items: [] }), "forever").ok).toBe(false);
    expect(readWorkspace(file({ version: 2 }), "forever")).toMatchObject({ ok: false, error: /version 2/ });
    expect(readWorkspace(file({ version: 3, game: "tbc" }), "forever")).toMatchObject({ ok: false, error: /another game \(tbc\)/ });
    expect(readWorkspace(file({ version: 3, game: "forever" }), "forever").ok).toBe(true);
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
