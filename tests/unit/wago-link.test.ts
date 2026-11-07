import { describe, expect, it } from "vitest";
import { isWagoId, parseWagoLink, readPushInput, wagoEncodedUrl } from "@/workspace";

describe("wago links", () => {
  it("reads wago links with or without scheme and www, and bare ids only where asked", () => {
    for (const link of ["https://wago.io/LEPRolmHn", "http://www.wago.io/LEPRolmHn/", "wago.io/LEPRolmHn", " https://wago.io/LEPRolmHn?x=1 "]) {
      expect(parseWagoLink(link)).toEqual({ ok: true, id: "LEPRolmHn" });
    }
    expect(parseWagoLink("LEPRolmHn")).toBeNull();
    expect(parseWagoLink("LEPRolmHn", { bareId: true })).toEqual({ ok: true, id: "LEPRolmHn" });
    expect(parseWagoLink("my-custom_slug", { bareId: true })).toEqual({ ok: true, id: "my-custom_slug" });
  });

  it("is not fooled by import strings, JSON or other sites, and refuses version links", () => {
    expect(parseWagoLink("!WA:2!abc", { bareId: true })).toBeNull();
    expect(parseWagoLink('{"d": {}}', { bareId: true })).toBeNull();
    expect(parseWagoLink("https://example.com/LEPRolmHn")).toBeNull();
    expect(parseWagoLink("https://wago.io/LEPRolmHn/3")).toMatchObject({ ok: false, error: expect.stringMatching(/one version/) });
    expect(parseWagoLink("https://wago.io/bad%20id")).toMatchObject({ ok: false });
  });

  it("validates ids before they reach wago's API", () => {
    expect(isWagoId("LEPRolmHn")).toBe(true);
    expect(isWagoId("../x")).toBe(false);
    expect(isWagoId("a b")).toBe(false);
    expect(wagoEncodedUrl("LEPRolmHn")).toBe("https://data.wago.io/api/raw/encoded?id=LEPRolmHn");
  });

  it("a push or window.auraSimulator.load reads wago JSON and wago links", () => {
    expect(readPushInput('  {"d": {"id": "x"}}')).toEqual({ wagoJson: '{"d": {"id": "x"}}' });
    expect(readPushInput({ d: { id: "x" }, m: "d" })).toEqual({ wagoJson: '{"d":{"id":"x"},"m":"d"}' });
    expect(readPushInput("https://wago.io/LEPRolmHn")).toEqual({ wagoId: "LEPRolmHn" });
    expect(readPushInput({ wago: "LEPRolmHn" })).toEqual({ wagoId: "LEPRolmHn" });
    expect(readPushInput("!WA:2!abc")).toEqual({ code: "!WA:2!abc" });
  });
});
