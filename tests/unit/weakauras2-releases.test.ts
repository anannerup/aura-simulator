import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, test } from "vitest";
import { buildAddonBundle } from "@/server/addon/bundle";
import { unzip } from "@/server/addon/unzip";
import {
  createWeakAuras2ReleaseCache,
  weakAuras2AddonSource,
  selectWeakAuras2Releases,
  type WeakAuras2Release,
} from "@/server/addon/weakauras2-releases";
import type { FetchFn } from "@/server/addon/upstream";
import { TBC_TEST_VERSION, WEAKAURAS2_FIXTURES, testWeakAuras2Cache, weakAuras2Available } from "../support/weakauras2";

/** A zip with stored and deflated entries (alternating), enough for the reader. */
function makeZip(files: Record<string, string>): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  Object.entries(files).forEach(([name, text], i) => {
    const data = Buffer.from(text);
    const method = i % 2 === 0 ? 8 : 0;
    const stored = method === 8 ? deflateRawSync(data) : data;
    const nameBytes = Buffer.from(name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(stored.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, stored);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(stored.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + stored.length;
  });
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, centralBytes, end]));
}

const sha256 = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function githubRelease(tag: string, zip?: Uint8Array, digest?: string) {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    published_at: "2026-10-10T17:21:31Z",
    assets: zip
      ? [{ name: `WeakAuras-${tag}.zip`, size: zip.length, digest: digest ?? sha256(zip), browser_download_url: `https://example.test/${tag}.zip` }]
      : [],
  };
}

/** GitHub's release list and the zips, from memory. `online: false` fails every request. */
function fakeUpstream(releases: unknown[], zips: Record<string, Uint8Array>, state = { online: true, requests: [] as string[] }): FetchFn {
  return async (input) => {
    state.requests.push(String(input));
    if (!state.online) throw new Error("offline");
    const u = new URL(String(input));
    if (u.host === "api.github.com") return Response.json(u.searchParams.get("page") === "1" ? releases : []);
    const tag = u.pathname.slice(1).replace(/\.zip$/, "");
    return zips[tag] ? new Response(Buffer.from(zips[tag])) : new Response("not found", { status: 404 });
  };
}

const dirs: string[] = [];
const tempRoot = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wa2-releases-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("unzip", () => {
  test("reads stored and deflated entries by their central directory", () => {
    const files = { "WeakAuras/Init.lua": "local versionString = \"5.22.1\"\r\n", "WeakAuras/WeakAuras_TBC.toc": "## Interface: 20506\r\n", "Empty/x.lua": "" };
    const entries = unzip(makeZip(files));
    expect(Object.fromEntries(entries.map((e) => [e.path, new TextDecoder().decode(e.bytes)]))).toEqual(files);
  });

  test("refuses what isn't a zip", () => {
    expect(() => unzip(new TextEncoder().encode("not a zip at all, just some text"))).toThrow(/Not a zip/);
  });
});

describe("selectWeakAuras2Releases (recorded GitHub answer)", () => {
  const recorded = JSON.parse(readFileSync(path.join(WEAKAURAS2_FIXTURES, "github-releases.json"), "utf8"));

  test("keeps releases from 5.21.0 on that have a WeakAuras-<tag>.zip, newest first", () => {
    const versions = selectWeakAuras2Releases(recorded).map((r) => r.version);
    expect(versions[0]).toBe("5.22.1");
    expect(versions.at(-1)).toBe("5.21.0");
    expect(versions).not.toContain("5.21.9"); // a release without assets
    expect(versions).not.toContain("5.20.7"); // before TBC Anniversary support
    const r = selectWeakAuras2Releases(recorded)[0];
    expect(r.zip.url).toBe("https://github.com/WeakAuras/WeakAuras2/releases/download/5.22.1/WeakAuras-5.22.1.zip");
    expect(r.zip.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("leaves out drafts and tags that aren't a bare version", () => {
    const zip = makeZip({ "a.lua": "" });
    const list = [
      { ...githubRelease("5.23.0", zip), draft: true },
      githubRelease("v5.22.2", zip),
      githubRelease("5.22.0-beta1", zip),
      githubRelease("5.22.1", zip),
    ];
    expect(selectWeakAuras2Releases(list).map((r) => r.version)).toEqual(["5.22.1", "5.22.0-beta1"]);
  });
});

describe("the release cache", () => {
  const zip = makeZip({
    "WeakAuras/WeakAuras_TBC.toc": "## Version: 5.22.1\r\n## X-Flavor: TBC\r\nInit.lua\r\n",
    "WeakAuras/Init.lua": 'local versionString = "5.22.1"\r\n',
  });

  test("lists versions, downloads a release once, unpacks it and reads its files from disk", async () => {
    const root = tempRoot();
    const state = { online: true, requests: [] as string[] };
    const cache = createWeakAuras2ReleaseCache({ root, fetch: fakeUpstream([githubRelease("5.22.1", zip), githubRelease("5.21.9")], { "5.22.1": zip }, state) });
    expect(await cache.versions()).toEqual({ releases: [expect.objectContaining({ version: "5.22.1" })], defaultVersion: "5.22.1" });
    expect(await cache.readText("5.22.1", "WeakAuras/WeakAuras_TBC.toc")).toContain("## X-Flavor: TBC");
    expect(await cache.readText("5.22.1", "WeakAuras/Init.lua")).toBe('local versionString = "5.22.1"\r\n');
    expect(state.requests.filter((u) => u.endsWith(".zip"))).toHaveLength(1);

    // A new cache over the same folder needs no network for an unpacked release.
    state.online = false;
    const again = createWeakAuras2ReleaseCache({ root, fetch: fakeUpstream([], {}, state) });
    expect(await again.readText("5.22.1", "WeakAuras/Init.lua")).toContain("5.22.1");
    // The release list falls back to the last good one.
    expect((await again.versions()).defaultVersion).toBe("5.22.1");
  });

  test("refuses a zip that doesn't match GitHub's checksum, and unpacks nothing", async () => {
    const root = tempRoot();
    const bad = githubRelease("5.22.1", zip, `sha256:${"0".repeat(64)}`);
    const cache = createWeakAuras2ReleaseCache({ root, fetch: fakeUpstream([bad], { "5.22.1": zip }) });
    await expect(cache.ensure("5.22.1")).rejects.toThrow(/checksum/);
    await expect(createWeakAuras2ReleaseCache({ root, fetch: fakeUpstream([], {}, { online: false, requests: [] }) }).readText("5.22.1", "WeakAuras/Init.lua")).rejects.toThrow();
  });

  test("refuses entries that would land outside the release's folder", async () => {
    const evil = makeZip({ "../escape.lua": "x" });
    const cache = createWeakAuras2ReleaseCache({ root: tempRoot(), fetch: fakeUpstream([githubRelease("5.22.1", evil)], { "5.22.1": evil }) });
    await expect(cache.ensure("5.22.1")).rejects.toThrow(/not a valid file path/);
  });

  test("names what is missing: an unknown or too old version, a file the release doesn't have", async () => {
    const cache = createWeakAuras2ReleaseCache({ root: tempRoot(), fetch: fakeUpstream([githubRelease("5.22.1", zip)], { "5.22.1": zip }) });
    await expect(cache.ensure("5.20.7")).rejects.toThrow(/no release 5\.20\.7 with a zip.*5\.21\.0 or later/);
    await expect(cache.ensure("main")).rejects.toThrow(/not a WeakAuras release/);
    await expect(cache.readText("5.22.1", "WeakAuras/Nope.lua")).rejects.toThrow(/has no file WeakAuras\/Nope\.lua/);
    await expect(cache.readText("5.22.1", "../etc/passwd")).rejects.toThrow(/not a valid file path/);
  });
});

describe("the release cache as TBC's addon source (ServerGame.addon)", () => {
  const zip = makeZip({
    "WeakAuras/WeakAuras_TBC.toc": "## X-Flavor: TBC\r\n",
    "WeakAuras/Media/Textures/logo_256_round.tga": "\u0000\u0001tga",
  });
  const source = () =>
    weakAuras2AddonSource(
      createWeakAuras2ReleaseCache({ root: tempRoot(), fetch: fakeUpstream([githubRelease("5.22.1", zip), githubRelease("5.21.0", zip)], { "5.22.1": zip }) }),
    );

  test("lists the releases with a zip as versions (a release's tag is its version) and resolves them", async () => {
    const s = source();
    expect(await s.versions()).toEqual({
      releases: [
        { version: "5.22.1", tag: "5.22.1", tagConfirmed: true, prerelease: false },
        { version: "5.21.0", tag: "5.21.0", tagConfirmed: true, prerelease: false },
      ],
      defaultRef: "5.22.1",
      tagsConfirmed: true,
    });
    expect(await s.resolve("v5.22.1")).toEqual({ input: "v5.22.1", ref: "5.22.1", key: "5.22.1", version: "5.22.1" });
    await expect(s.resolve("5.20.7")).rejects.toThrow(/no release 5\.20\.7 with a zip/);
  });

  test("serves a release's files as bytes (media) and lists them with their hashes", async () => {
    const s = source();
    const { bytes } = await s.readFile("5.22.1", "WeakAuras/Media/Textures/logo_256_round.tga");
    expect(new TextDecoder().decode(bytes)).toBe("\u0000\u0001tga");
    const { listing } = await s.listFiles("5.22.1");
    expect(listing.source).toBe("release-zip");
    expect(listing.files.map((f) => f.path)).toEqual(["WeakAuras/Media/Textures/logo_256_round.tga", "WeakAuras/WeakAuras_TBC.toc"]);
    expect(listing.files[1].hash).toBe(createHash("sha256").update("## X-Flavor: TBC\r\n").digest("hex"));
  });
});

describe("WeakAuras2 5.22.1's real zip (downloaded once into .cache)", () => {
  test("its full bundle holds the _TBC.toc file sets, not the other flavors' files", async (ctx) => {
    if (!(await weakAuras2Available())) return ctx.skip();
    const release: WeakAuras2Release = await testWeakAuras2Cache().ensure(TBC_TEST_VERSION);
    expect(release.zip.digest).toBe("sha256:d0d4406b62e84d5e023f2af95e93d229907a41074d2749dd46643c8843536c33");
    const source = weakAuras2AddonSource(testWeakAuras2Cache());
    const bundle = await buildAddonBundle(source, TBC_TEST_VERSION, "full", "tbc");
    const paths = Object.keys(bundle.files);
    expect(paths).toContain("WeakAuras/WeakAuras_TBC.toc");
    expect(paths).toContain("WeakAuras/Types_TBC.lua");
    expect(paths).toContain("WeakAuras/LibSpecializationWrapper.lua");
    expect(paths).toContain("WeakAurasOptions/AceGUI-Widgets/AceGUIWidget-WeakAurasMiniTalent_Wrath.lua");
    expect(paths).not.toContain("WeakAuras/Types_Vanilla.lua");
    expect(paths).not.toContain("WeakAuras/Types_Mists.lua");
    expect(bundle.files["WeakAuras/Init.lua"]).toMatch(/^local versionString = "5\.22\.1"/m);
    const light = await buildAddonBundle(source, TBC_TEST_VERSION, "light", "tbc");
    expect(Object.keys(light.files).sort()).toEqual([
      "WeakAuras/Init.lua",
      "WeakAuras/Libs/LibDeflate/LibDeflate.lua",
      "WeakAuras/Libs/LibSerialize/LibSerialize.lua",
      "WeakAuras/Libs/LibStub/LibStub.lua",
      "WeakAuras/Transmission.lua",
      "WeakAuras/WeakAuras.lua",
    ]);
  });
});
