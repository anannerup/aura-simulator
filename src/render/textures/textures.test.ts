import { Blp, BlpImage, BLP_COLOR_FORMAT, BLP_IMAGE_FORMAT } from "@wowserhq/format";
import { describe, expect, it, vi } from "vitest";
import {
  createTextureLoader,
  cropTexture,
  decodeTexture,
  shadePixels,
  texCoordBackground,
  texCoordPixelRect,
  textureUrls,
  type DecodedTexture,
} from "./index";

// 2×2 test image, RGBA: red, green / blue, half-transparent white
const PIXELS = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128];

function makeBlp(): Uint8Array {
  const blp = new Blp();
  blp.setImage(new BlpImage(2, 2, new Uint8Array(PIXELS), BLP_IMAGE_FORMAT.IMAGE_ABGR8888), BLP_COLOR_FORMAT.COLOR_RAW);
  return blp.save() as Uint8Array;
}

function makeTga(): Uint8Array {
  // uncompressed true-colour, 32 bpp, top-left origin (descriptor bit 5) + 8 alpha bits
  const header = [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 32, 0x28];
  const body: number[] = [];
  for (let i = 0; i < PIXELS.length; i += 4) body.push(PIXELS[i + 2], PIXELS[i + 1], PIXELS[i], PIXELS[i + 3]); // BGRA
  return new Uint8Array([...header, ...body]);
}

describe("decodeTexture", () => {
  it("decodes BLP2 to RGBA", () => {
    const t = decodeTexture(makeBlp());
    expect([t.width, t.height]).toEqual([2, 2]);
    expect(Array.from(t.data)).toEqual(PIXELS);
  });

  it("decodes TGA to RGBA", () => {
    const t = decodeTexture(makeTga());
    expect([t.width, t.height]).toEqual([2, 2]);
    expect(Array.from(t.data)).toEqual(PIXELS);
  });
});

describe("texture paths", () => {
  it("maps FileDataIDs and known Blizzard paths to wago.tools", () => {
    expect(textureUrls(457293, "1.15.0")).toEqual(["https://wago.tools/api/casc/457293"]);
    expect(textureUrls("Interface\\SpellActivationOverlay\\IconAlertAnts", "x")).toEqual(["https://wago.tools/api/casc/457294"]);
    expect(textureUrls("Interface\\BUTTONS\\WHITE8X8.blp", "x")).toEqual(["https://wago.tools/api/casc/130871"]);
  });

  it("maps addon paths to the Musca Auras repository, trying .tga then .blp", () => {
    expect(textureUrls("Interface\\AddOns\\WeakAuras\\Media\\Textures\\Square_White", "1.15.0")).toEqual([
      "https://cdn.jsdelivr.net/gh/dldvlpr-addons-wow/Musca-Auras@1.15.0/WeakAuras/Media/Textures/Square_White.tga",
      "https://cdn.jsdelivr.net/gh/dldvlpr-addons-wow/Musca-Auras@1.15.0/WeakAuras/Media/Textures/Square_White.blp",
    ]);
  });

  it("rejects unknown Blizzard paths", () => {
    expect(() => textureUrls("Interface\\Nope\\Nothing", "x")).toThrow(/Unknown texture path/);
  });
});

describe("pixel helpers", () => {
  it("desaturates then multiplies by the vertex colour, keeping alpha", () => {
    const out = shadePixels(new Uint8ClampedArray(PIXELS), { desaturate: true, tint: [1, 0.5, 0] });
    // red → luminance 0.299*255 ≈ 76
    expect(Array.from(out.slice(0, 4))).toEqual([76, 38, 0, 255]);
    expect(out[15]).toBe(128);
    expect(Array.from(shadePixels(new Uint8ClampedArray(PIXELS), { tint: [0, 1, 1] }).slice(0, 8))).toEqual([0, 0, 0, 255, 0, 255, 0, 255]);
  });

  it("crops to a texcoord rect", () => {
    const tex: DecodedTexture = { width: 2, height: 2, data: new Uint8ClampedArray(PIXELS) };
    expect(texCoordPixelRect([0.5, 1, 0, 1], 2, 2)).toEqual({ left: 1, top: 0, width: 1, height: 2 });
    const c = cropTexture(tex, [0.5, 1, 0, 1]);
    expect(Array.from(c.data)).toEqual([0, 255, 0, 255, 255, 255, 255, 128]);
  });

  it("turns SetTexCoord into CSS background size/position", () => {
    // IconAlert spark: 128×256 texture, coords 1..79 × 1..69 px, drawn at 56×56
    const bg = texCoordBackground([0.0078125, 0.6171875, 0.00390625, 0.26953125], 56, 56);
    const w = 56 / 0.609375;
    const h = 56 / 0.265625;
    expect(bg.backgroundSize).toBe(`${w}px ${h}px`);
    expect(bg.backgroundPosition).toBe(`${-0.0078125 * w}px ${-0.00390625 * h}px`);
  });
});

function memoryCaches() {
  const store = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (url: string) => store.get(url)?.clone()),
    put: vi.fn(async (url: string, res: Response) => void store.set(url, res)),
  };
  return { caches: { open: vi.fn(async () => cache as unknown as Cache) }, store, cache };
}

describe("texture loader", () => {
  const blp = makeBlp();
  const okFetch = () => vi.fn(async () => new Response(blp.slice(), { status: 200 }));

  it("fetches once, decodes and caches in memory and Cache Storage", async () => {
    const fetch = okFetch();
    const persistent = memoryCaches();
    const loader = createTextureLoader({ fetch, persistentCache: persistent.caches, encode: async () => "blob:x" });
    const [a, b] = await Promise.all([loader.load(457293), loader.load("Interface\\SpellActivationOverlay\\IconAlert")]);
    expect(a.width).toBe(2);
    expect(b.width).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2); // by number and by path are separate keys...
    expect(persistent.store.has("https://wago.tools/api/casc/457293")).toBe(true);

    // ...but a fresh loader (new page) hits Cache Storage, not the network
    const fetch2 = okFetch();
    const loader2 = createTextureLoader({ fetch: fetch2, persistentCache: persistent.caches, encode: async () => "blob:y" });
    expect((await loader2.load(457293)).width).toBe(2);
    expect(fetch2).not.toHaveBeenCalled();
  });

  it("encodes each variant once with crop, desaturation and tint applied", async () => {
    const encode = vi.fn(async (t: DecodedTexture) => `img:${t.width}x${t.height}:${Array.from(t.data.slice(0, 4))}`);
    const loader = createTextureLoader({ fetch: okFetch(), persistentCache: null, encode });
    const plain = await loader.url(1);
    expect(plain).toEqual({ url: "img:2x2:255,0,0,255", width: 2, height: 2 });
    const tinted = await loader.url(1, { desaturate: true, tint: [1, 1, 1], crop: [0, 0.5, 0, 0.5] });
    expect(tinted).toEqual({ url: "img:1x1:76,76,76,255", width: 1, height: 1 });
    await loader.url(1, { desaturate: true, tint: [1, 1, 1], crop: [0, 0.5, 0, 0.5] });
    expect(encode).toHaveBeenCalledTimes(2);
  });

  it("survives a broken Cache Storage", async () => {
    const fetch = okFetch();
    const loader = createTextureLoader({
      fetch,
      persistentCache: { open: async () => Promise.reject(new Error("SecurityError")) },
      encode: async () => "x",
    });
    expect((await loader.load(5)).height).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the next candidate URL and reports missing textures", async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith(".blp") ? new Response(blp.slice()) : new Response("nope", { status: 404 }),
    );
    const loader = createTextureLoader({ fetch, persistentCache: null, encode: async () => "x" });
    expect((await loader.load("Interface\\AddOns\\WeakAuras\\Media\\Textures\\foo")).width).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);

    const missing = createTextureLoader({ fetch: vi.fn(async () => new Response("", { status: 404 })), persistentCache: null });
    await expect(missing.load(42)).rejects.toThrow(/Texture not found: 42/);
  });
});
