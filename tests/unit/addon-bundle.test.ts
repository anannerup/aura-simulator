import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bundleFetcher, collectAddonBundle } from "@/core";
import { buildAddonBundle, createAddonSourceCache, getEncodedAddonBundle, type FetchFn } from "@/server/addon";
import { FOREVER_ADDON } from "@/games/forever/sources";
import { createFixtureFetch } from "../fixtures/forever/addon/fixture-fetch";

/**
 * A tiny synthetic addon: tocs that pull in XML, XML that includes XML and scripts (with Windows
 * slashes and `..`), a foreign locale the VM skips, and files nothing loads.
 */
const ADDON: Record<string, string> = {
  "WeakAuras/WeakAuras.toc": "## Interface: 11508\n## Version: 5.22.0\n# comment\nembeds.xml\nlocales.xml\nInit.lua\nWeakAuras.lua\nTransmission.lua\n",
  "WeakAuras/embeds.xml": '<Ui><Script file="Libs\\LibStub\\LibStub.lua"/><Include file="Libs/LibDeflate/lib.xml"/></Ui>',
  "WeakAuras/Libs/LibDeflate/lib.xml": '<Ui><Script file="LibDeflate.lua"/><Script file="../LibSerialize/LibSerialize.lua"/></Ui>',
  "WeakAuras/locales.xml": '<Ui><Script file="Locales/enUS.lua"/><Script file="Locales/deDE.lua"/></Ui>',
  "WeakAuras/Locales/enUS.lua": "-- enUS",
  "WeakAuras/Locales/deDE.lua": "-- deDE",
  "WeakAuras/Libs/LibStub/LibStub.lua": "-- LibStub",
  "WeakAuras/Libs/LibDeflate/LibDeflate.lua": "-- LibDeflate",
  "WeakAuras/Libs/LibSerialize/LibSerialize.lua": "-- LibSerialize",
  "WeakAuras/Init.lua": "-- Init",
  "WeakAuras/WeakAuras.lua": "-- WeakAuras",
  "WeakAuras/Transmission.lua": "-- Transmission",
  "WeakAuras/Unused.lua": "-- not in the toc",
  "WeakAurasOptions/WeakAurasOptions.toc": "## Interface: 11508\nOptions.lua\n",
  "WeakAurasOptions/Options.lua": "-- Options",
  "README.md": "readme",
};

const LIGHT = [
  "WeakAuras/Init.lua",
  "WeakAuras/Libs/LibDeflate/LibDeflate.lua",
  "WeakAuras/Libs/LibSerialize/LibSerialize.lua",
  "WeakAuras/Libs/LibStub/LibStub.lua",
  "WeakAuras/Transmission.lua",
  "WeakAuras/WeakAuras.lua",
];

const FULL = [
  ...LIGHT,
  "WeakAuras/Libs/LibDeflate/lib.xml",
  "WeakAuras/Locales/enUS.lua",
  "WeakAuras/WeakAuras.toc",
  "WeakAuras/embeds.xml",
  "WeakAuras/locales.xml",
  "WeakAurasOptions/Options.lua",
  "WeakAurasOptions/WeakAurasOptions.toc",
].sort();

const memoryFetcher = (asked: string[] = []) => async (p: string) => {
  asked.push(p);
  if (!(p in ADDON)) throw new Error(`missing ${p}`);
  return ADDON[p];
};

describe("collectAddonBundle", () => {
  it("light holds exactly what encode/decode reads", async () => {
    const bundle = await collectAddonBundle(memoryFetcher(), "v1.15.0", "light");
    expect(bundle.ref).toBe("v1.15.0");
    expect(bundle.set).toBe("light");
    expect(Object.keys(bundle.files)).toEqual(LIGHT);
    expect(bundle.files["WeakAuras/Init.lua"]).toBe("-- Init");
  });

  it("full follows the VM's toc and XML expansion, skipping foreign locales, each file read once", async () => {
    const asked: string[] = [];
    const bundle = await collectAddonBundle(memoryFetcher(asked), "v1.15.0", "full");
    expect(Object.keys(bundle.files)).toEqual(FULL);
    expect(asked.sort()).toEqual(FULL);
  });

  it("bundleFetcher serves from the bundle and asks the fallback for anything else", async () => {
    const bundle = await collectAddonBundle(memoryFetcher(), "v1.15.0", "light");
    const fallback: string[] = [];
    const fetchSource = bundleFetcher(bundle, async (p) => {
      fallback.push(p);
      return `fallback ${p}`;
    });
    expect(await fetchSource("WeakAuras/Init.lua")).toBe("-- Init");
    expect(await fetchSource("README.md")).toBe("fallback README.md");
    expect(await fetchSource("constructor")).toBe("fallback constructor");
    expect(fallback).toEqual(["README.md", "constructor"]);
  });
});

describe("server bundle", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "addon-bundle-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  /** The recorded jsDelivr/GitHub fixture, with the synthetic addon as file contents. */
  function open() {
    const fixture = createFixtureFetch();
    const cdn: string[] = [];
    const fetch: FetchFn = async (input, init) => {
      const m = /^https:\/\/cdn\.jsdelivr\.net\/gh\/dldvlpr-addons-wow\/Musca-Auras@[^/]+\/(.+)$/.exec(String(input));
      if (!m) return fixture.fetch(input, init);
      cdn.push(m[1]);
      return m[1] in ADDON ? new Response(ADDON[m[1]]) : new Response("not found", { status: 404 });
    };
    return { cache: createAddonSourceCache({ ...FOREVER_ADDON, root, fetch }), cdn };
  }

  it("reads every file through the disk cache, at the resolved ref", async () => {
    const first = open();
    const bundle = await buildAddonBundle(first.cache, "1.15.0", "full");
    expect(bundle.ref).toBe("v1.15.0");
    expect(Object.keys(bundle.files)).toEqual(FULL);
    expect(first.cdn.sort()).toEqual(FULL);

    // A restarted server builds it from disk alone.
    const second = open();
    expect(await buildAddonBundle(second.cache, "v1.15.0", "full")).toEqual(bundle);
    expect(second.cdn).toEqual([]);
  });

  it("fails when a file the addon loads is missing", async () => {
    const { cache } = open();
    delete ADDON["WeakAurasOptions/Options.lua"];
    try {
      await expect(buildAddonBundle(cache, "v1.15.0", "full")).rejects.toThrow();
    } finally {
      ADDON["WeakAurasOptions/Options.lua"] = "-- Options";
    }
  });

  it("encodes JSON with a content ETag and a gzip body that inflates to the same JSON", async () => {
    const { cache } = open();
    const encoded = await getEncodedAddonBundle(cache, "v1.15.0", "light");
    expect(encoded.resolution.ref).toBe("v1.15.0");
    expect(encoded.etag).toMatch(/^"[A-Za-z0-9_-]{32}"$/);
    const json = JSON.parse(new TextDecoder().decode(encoded.json));
    expect(json).toEqual({ ref: "v1.15.0", set: "light", files: Object.fromEntries(LIGHT.map((p) => [p, ADDON[p]])) });
    expect(Buffer.from(gunzipSync(await encoded.gzipped()))).toEqual(Buffer.from(encoded.json));
    // The same ref and set come from memory; the other set is a different bundle.
    expect(await getEncodedAddonBundle(cache, "1.15.0", "light")).toBe(encoded);
    expect((await getEncodedAddonBundle(cache, "v1.15.0", "full")).etag).not.toBe(encoded.etag);
  });
});
