import { describe, expect, it } from "vitest";
import {
  buildPageUrl,
  buildSearch,
  MAX_ADDRESS_CODE_LENGTH,
  needsShortLink,
  newerWorkspace,
  parseAddress,
  encodeBundle,
  parseBundle,
  parseWorkspace,
} from "@/workspace";

const CODE = "!WA:2!Tr1ox(TnqKa)pL9";

describe("address", () => {
  it("round-trips a state code, escaping parentheses but keeping ! and : readable", () => {
    const search = buildSearch({ workspaceId: "default", code: CODE });
    expect(search).toBe("?code=!WA:2!Tr1ox%28TnqKa%29pL9");
    expect(parseAddress(search)).toEqual({ workspaceId: "default", code: CODE, shortId: null });
  });

  it("also reads codes whose parentheses were left unescaped", () => {
    expect(parseAddress(`?code=${CODE}`).code).toBe(CODE);
  });

  it("puts a non-default workspace in w= and leaves the default out", () => {
    expect(buildSearch({ workspaceId: "abc-1", code: CODE })).toMatch(/^\?w=abc-1&code=/);
    expect(parseAddress("?w=abc-1").workspaceId).toBe("abc-1");
    expect(parseAddress("").workspaceId).toBe("default");
    expect(parseAddress("?w=bad%20id").workspaceId).toBe("default");
  });

  it("uses s= for a short link, and a code wins over a short link", () => {
    expect(buildSearch({ workspaceId: "default", code: CODE, shortId: "Ab12Cd34" })).toBe("?s=Ab12Cd34");
    expect(parseAddress("?s=Ab12Cd34")).toEqual({ workspaceId: "default", code: null, shortId: "Ab12Cd34" });
    expect(parseAddress(`?s=Ab12Cd34&code=${CODE}`).shortId).toBeNull();
  });

  it("asks for a short link only past the threshold", () => {
    expect(needsShortLink(CODE)).toBe(false);
    expect(needsShortLink(`!WA:2!${"a".repeat(MAX_ADDRESS_CODE_LENGTH)}`)).toBe(true);
  });

  it("bundles several codes one per line, and reads a lone code as a one-item bundle", () => {
    const other = "!WA:2!abc";
    expect(parseBundle(encodeBundle([CODE, other]))).toEqual([CODE, other]);
    expect(parseBundle(CODE)).toEqual([CODE]);
    expect(parseBundle(`${CODE}\nnope`)).toBeNull();
    expect(parseBundle("")).toBeNull();
  });

  it("builds absolute page URLs", () => {
    expect(buildPageUrl("http://localhost:3000/", { workspaceId: "default" })).toBe("http://localhost:3000/");
    expect(buildPageUrl("http://x", { workspaceId: "w1", shortId: "Ab12Cd34" })).toBe("http://x/?w=w1&s=Ab12Cd34");
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
