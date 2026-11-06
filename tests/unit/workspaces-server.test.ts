import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_ADDON_REF, loadAddon, sampleIconAura, type AuraCore } from "@/core";
import { createShortLinkStore, createWorkspaceHub, parsePushBody, PushError, toStateCode } from "@/server/workspaces";
import { cachedAddonFetcher } from "../support/addon-source";

describe("short links", () => {
  it("store a code under a stable short ID and give it back exactly", () => {
    const store = createShortLinkStore({ dbPath: ":memory:" });
    const code = `!WA:2!${"x(y)".repeat(1000)}`;
    const id = store.put(code);
    expect(id).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(store.put(code)).toBe(id);
    expect(store.get(id)).toBe(code);
    expect(store.get("nope1234")).toBeNull();
    expect(store.put(`${code}z`)).not.toBe(id);
    store.close();
  });
});

describe("workspace hub", () => {
  it("keeps the latest code and tells listeners of that workspace only", () => {
    const hub = createWorkspaceHub();
    const seen: string[] = [];
    const off = hub.subscribe("a", (s) => seen.push(`${s.id}:${s.code}:${s.revision}`));
    hub.subscribe("b", () => seen.push("b"));
    expect(hub.get("a")).toMatchObject({ code: null, revision: 0 });
    hub.set("a", "!WA:2!one");
    hub.set("a", "!WA:2!two");
    off();
    hub.set("a", "!WA:2!three");
    expect(seen).toEqual(["a:!WA:2!one:1", "a:!WA:2!two:2"]);
    expect(hub.get("a")).toMatchObject({ code: "!WA:2!three", revision: 3 });
  });
});

describe("push", () => {
  let core: AuraCore;
  beforeAll(async () => {
    core = await loadAddon(DEFAULT_ADDON_REF, { fetchSource: cachedAddonFetcher(DEFAULT_ADDON_REF) });
  });

  it("reads JSON code, JSON documents and bare codes", () => {
    expect(parsePushBody('{"code": " !WA:2!abc "}', "application/json")).toEqual({ code: "!WA:2!abc" });
    expect(parsePushBody("!WA:2!abc\n", "text/plain")).toEqual({ code: "!WA:2!abc" });
    expect(parsePushBody('{"aura": {"id": "x"}}', null)).toEqual({ aura: { id: "x" }, children: [] });
    expect(() => parsePushBody("hello", null)).toThrow(PushError);
    expect(() => parsePushBody('{"aura": [1]}', null)).toThrow(/aura/);
    expect(() => parsePushBody('{"aura": {}, "children": 3}', null)).toThrow(/children/);
  });

  it("encodes a document to a state code that decodes back to it", () => {
    const aura = sampleIconAura(core.internalVersion);
    const code = toStateCode(core, { aura, children: [] });
    expect(code).toMatch(/^!WA:2!/);
    expect(core.decode(code).aura).toEqual(aura);
    expect(toStateCode(core, { code })).toBe(code);
  });

  it("rejects codes the addon can't decode with 422", () => {
    try {
      toStateCode(core, { code: "!WA:2!abc" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PushError);
      expect((e as PushError).status).toBe(422);
    }
  });
});
