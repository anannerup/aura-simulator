import { beforeAll, describe, expect, it } from "vitest";
import { loadAddon, sampleIconAura, type AuraCore } from "@/core";
import { createWorkspaceHub, MAX_PUSH_BYTES, parsePushBody, PushError, readBodyText, toStateCode } from "@/server/workspaces";
import { nodeFromState } from "@/workspace";
import { cachedAddonFetcher } from "../support/addon-source";

describe("workspace hub", () => {
  it("keeps recent codes and tells listeners of that workspace only, without the code", () => {
    const hub = createWorkspaceHub();
    const seen: string[] = [];
    const off = hub.subscribe("a", (n) => seen.push(`${n.id}:${n.revision}:${n.source}:${"code" in n}`));
    hub.subscribe("b", () => seen.push("b"));
    expect(hub.get("a")).toMatchObject({ code: null, revision: 0 });
    hub.set("a", "!WA:2!one", "page-1");
    hub.set("a", "!WA:2!two");
    off();
    hub.set("a", "!WA:2!three");
    expect(seen).toEqual(["a:1:page-1:false", "a:2:null:false"]);
    expect(hub.get("a")).toMatchObject({ code: "!WA:2!three", revision: 3 });
    expect(hub.get("a", 1)).toMatchObject({ code: "!WA:2!one", source: "page-1" });
    expect(hub.get("a", 9)).toBeNull();
  });

  it("forgets old revisions and workspaces past its size limits, keeping the latest code", () => {
    const hub = createWorkspaceHub({ revisionsKept: 2, maxTotalChars: 100 });
    hub.set("a", `!WA:2!${"a".repeat(40)}`);
    hub.set("b", `!WA:2!${"b".repeat(40)}`);
    hub.set("b", `!WA:2!${"c".repeat(40)}`);
    expect(hub.get("a").code).toBeNull(); // the least recently changed workspace went first
    expect(hub.get("b", 1)).not.toBeNull();
    hub.set("b", `!WA:2!${"d".repeat(200)}`); // alone over the limit: still kept
    expect(hub.get("b")).toMatchObject({ revision: 3 });
    expect(hub.get("b", 2)).toBeNull();
  });
});

describe("push body", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    new Request("http://x/api", { method: "POST", body, headers });

  it("reads multi-megabyte bodies as UTF-8", async () => {
    const code = `!WA:2!${"Ab(c)".repeat(1_000_000)}`;
    expect(await readBodyText(post(code))).toBe(code);
    expect(await readBodyText(post("æøå ✨"))).toBe("æøå ✨");
    expect(MAX_PUSH_BYTES).toBeGreaterThanOrEqual(16 * 1024 * 1024);
  });

  it("stops with 413 past the limit, by Content-Length or while streaming", async () => {
    const tooBig = await readBodyText(post("x".repeat(101)), 100).catch((e: unknown) => e);
    expect(tooBig).toBeInstanceOf(PushError);
    expect((tooBig as PushError).status).toBe(413);
    const declared = new Request("http://x/api", { method: "POST", body: "x", headers: { "content-length": "999999999999" } });
    expect(((await readBodyText(declared).catch((e: unknown) => e)) as PushError).status).toBe(413);
  });
});

describe("push", () => {
  let core: AuraCore;
  beforeAll(async () => {
    core = await loadAddon("v1.15.0", { fetchSource: cachedAddonFetcher("v1.15.0") });
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

  it("encodes a pushed group (document plus flattened children) to a code that rebuilds the same subtree", () => {
    const icon = (id: string) => ({ ...sampleIconAura(core.internalVersion), id, uid: `u${id}` });
    // Pushed loosely: no controlledChildren/parent, as an agent may send it; the addon's import nests every child.
    const group = { id: "Buffs", uid: "uBuffs", regionType: "group", internalVersion: core.internalVersion };
    const code = toStateCode(core, parsePushBody(JSON.stringify({ aura: group, children: [icon("A"), icon("B")] }), "application/json"));
    const node = nodeFromState(core.decode(code));
    expect(node.aura.controlledChildren).toEqual(["A", "B"]);
    expect(node.items!.map((n) => n.aura.parent)).toEqual(["Buffs", "Buffs"]);
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
