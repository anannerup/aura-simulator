/**
 * The icon index: finding icons by how they look. TBC's recorded file list names the icons; their pixels are
 * synthetic 64×64 TGAs (decodeTexture reads TGA as well as BLP) served by a fake wago.tools, so no network is needed.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { TBC_SPELLS } from "@/games/tbc/sources";
import { createGameFiles } from "@/server/game-files";
import { BadUploadError, createIconIndex, decodeUpload, type IndexSimilarResult, type RgbaImage } from "@/server/icon-index";
import { createTbcFixtureFetch } from "../fixtures/tbc/spells/fixture-fetch";

const SIZE = 64;

/** An uncompressed 32-bit TGA, top row first. */
function tga(image: RgbaImage): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(18 + image.width * image.height * 4);
  out[2] = 2; // uncompressed true colour
  out[12] = image.width & 0xff;
  out[13] = image.width >> 8;
  out[14] = image.height & 0xff;
  out[15] = image.height >> 8;
  out[16] = 32;
  out[17] = 0x28; // 8 alpha bits, top-left origin
  for (let i = 0; i < image.width * image.height; i++) {
    out.set([image.data[i * 4 + 2], image.data[i * 4 + 1], image.data[i * 4], image.data[i * 4 + 3]], 18 + i * 4);
  }
  return out;
}

/** A 64×64 icon with a dark 3-pixel edge (like the game's icons) and 8×8 blocks of `colour(x, y)` inside. */
function icon(colour: (bx: number, by: number) => [number, number, number]): RgbaImage {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const edge = x < 3 || y < 3 || x >= SIZE - 3 || y >= SIZE - 3;
      const [r, g, b] = edge ? [20, 20, 20] : colour(Math.floor(x / 8), Math.floor(y / 8));
      data.set([r, g, b, 255], (y * SIZE + x) * 4);
    }
  }
  return { width: SIZE, height: SIZE, data };
}

/** Random blocks, the same for the same seed. */
function randomIcon(seed: number): RgbaImage {
  let s = seed;
  const next = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) * 255;
  const blocks = Array.from({ length: 64 }, () => [next(), next(), next()] as [number, number, number]);
  return icon((bx, by) => blocks[by * 8 + bx].map(Math.round) as [number, number, number]);
}

/** A family: one shape, three colours of equal luminance (0.299 R + 0.587 G + 0.114 B ≈ 101.8). */
const POTION_SHAPE = (bx: number, by: number) => (Math.abs(bx - 3.5) + Math.abs(by - 4) < 3 ? 1 : 0.3);
const potion = ([r, g, b]: [number, number, number]) =>
  icon((bx, by) => [r, g, b].map((c) => Math.round(c * POTION_SHAPE(bx, by))) as [number, number, number]);
const RED = 134852; // inv_potion_72
const GREEN = 134853; // inv_potion_73
const PURPLE = 134854; // inv_potion_74
const BASILISK = 134042;
const MISSING = 136235; // temp: wago.tools answers 404
const BROKEN = 134016; // inv_misc_food_60: not a texture

/** A fake wago.tools: `failing` downloads fail that many times (Infinity: always), then answer. */
function fakeCasc(options: { failing?: Map<number, number>; delay?: number; pixels?: [number, RgbaImage][] } = {}) {
  const pixels = new Map<number, RgbaImage>([
    [RED, potion([200, 60, 60])],
    [GREEN, potion([60, 130, 60])],
    [PURPLE, potion([161, 60, 161])],
    ...(options.pixels ?? []),
  ]);
  const failures = new Map(options.failing);
  const calls: number[] = [];
  let active = 0;
  let maxActive = 0;
  const fetch = async (url: string): Promise<Response> => {
    const m = /^https:\/\/wago\.tools\/api\/casc\/(\d+)$/.exec(url);
    if (!m) throw new TypeError(`fetch failed: ${url}`);
    const id = Number(m[1]);
    calls.push(id);
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      await new Promise((r) => setTimeout(r, options.delay ?? 0));
      const fails = failures.get(id) ?? 0;
      if (fails > 0) {
        failures.set(id, fails - 1);
        throw new TypeError("fetch failed: offline");
      }
      if (id === MISSING) return new Response("", { status: 404 });
      if (id === BROKEN) return new Response("not a texture");
      return new Response(tga(pixels.get(id) ?? randomIcon(id)));
    } finally {
      active--;
    }
  };
  return { fetch, calls, pixels, maxActive: () => maxActive };
}

function setup(
  options: {
    dbPath?: string;
    failing?: Map<number, number>;
    concurrency?: number;
    onDemandLimit?: number;
    delay?: number;
    now?: () => number;
    pixels?: [number, RgbaImage][];
    addonTextures?: { path: string; image: RgbaImage }[];
    addonRead?: string[];
  } = {},
) {
  const files = createGameFiles({ source: TBC_SPELLS, dbPath: ":memory:", fetch: createTbcFixtureFetch().fetch });
  const casc = fakeCasc(options);
  const index = createIconIndex({
    files,
    dbPath: options.dbPath ?? ":memory:",
    fetch: casc.fetch,
    concurrency: options.concurrency,
    onDemandLimit: options.onDemandLimit,
    retryDelayMs: 0,
    now: options.now,
    addonTextures: async () =>
      (options.addonTextures ?? []).map((t) => ({
        path: t.path,
        read: async () => {
          options.addonRead?.push(t.path);
          return tga(t.image);
        },
      })),
  });
  return { files, index, casc };
}

/**
 * A player's crop of an icon as the game draws it (RegionTypes/Icon.lua): the art's texture coordinates
 * `0.5 ± (1 - zoom / 2) / 2` (zoom / 4 cut off each edge) stretched over `size` pixels; a black border `border` pixels
 * thick drawn over the art's outer edge (a `subborder` at `border_offset` 0); `margin` pixels of background around it.
 */
async function screenshotCrop(
  image: RgbaImage,
  { zoom = 0, size = 36, border = 0, margin = 0, grey = false, format = "png" as "png" | "jpeg" } = {},
) {
  // Cut at a tenth of a texel: the icon enlarged 10× first.
  const big = SIZE * 10;
  const cut = Math.round((big * zoom) / 4);
  const enlarged = await sharp(Buffer.from(image.data), { raw: { width: SIZE, height: SIZE, channels: 4 } }).resize(big, big, { kernel: "nearest" }).png().toBuffer();
  let art = await sharp(await sharp(enlarged).extract({ left: cut, top: cut, width: big - 2 * cut, height: big - 2 * cut }).png().toBuffer())
    .resize(size, size)
    .png()
    .toBuffer();
  if (border) {
    const inner = await sharp(art).extract({ left: border, top: border, width: size - 2 * border, height: size - 2 * border }).png().toBuffer();
    art = await sharp({ create: { width: size, height: size, channels: 4, background: "#000" } }).composite([{ input: inner, left: border, top: border }]).png().toBuffer();
  }
  let pipeline = sharp(art);
  if (grey) pipeline = pipeline.greyscale();
  if (margin) pipeline = pipeline.extend({ top: margin, bottom: margin, left: margin, right: margin, background: "#303030" });
  const bytes = format === "png" ? await pipeline.png().toBuffer() : await pipeline.jpeg({ quality: 85 }).toBuffer();
  return decodeUpload(new Uint8Array(bytes));
}

const ok = (r: Awaited<ReturnType<ReturnType<typeof createIconIndex>["similar"]>>): Extract<IndexSimilarResult, { kind: "icon" }> => {
  if (r.status !== "ok" || r.kind !== "icon") throw new Error(`expected icons, got ${JSON.stringify(r)}`);
  return r;
};

describe("icon index", () => {
  it("with a name filter, indexes just the matching icons and finds a zoomed, bordered crop", async () => {
    const { index, casc, files } = setup();
    const upload = await screenshotCrop(randomIcon(BASILISK), { zoom: 0.48, border: 2, format: "jpeg" });
    const result = ok(await index.similar(upload, { q: "food" }));
    const foods = await files.listIcons("food");
    expect(new Set(casc.calls)).toEqual(new Set(foods.map((i) => i.id)));
    expect(result).toMatchObject({ query: "food", requestedMode: "auto", mode: "colour", offset: 0, limit: 20 });
    expect(result.total + result.unavailable).toBe(foods.length);
    expect(result.unavailable).toBe(1); // BROKEN isn't a texture
    expect(result.results[0]).toMatchObject({ id: BASILISK, name: "inv_misc_food_86_basilisk", path: "Interface\\Icons\\INV_Misc_Food_86_Basilisk" });
    expect(result.results[0].zoom).toBeGreaterThanOrEqual(0.24);
    expect(result.results[0].zoom).toBeLessThanOrEqual(0.72);
    expect(result.results[0].distance).toBeLessThan(0.05);
    expect(result.results[1].distance).toBeGreaterThan(result.results[0].distance * 2);
    expect(result.closeToBest).toBe(1);

    // Asked again, nothing is downloaded again.
    const before = casc.calls.length;
    ok(await index.similar(upload, { q: "food" }));
    expect(casc.calls.length).toBe(before);
  });

  it("reports the zoom the icon is drawn at, cropped at its edge, also under a border drawn over the edge", async () => {
    const { index } = setup();
    for (const zoom of [0, 0.1, 0.3, 0.5, 0.8]) {
      for (const crop of [{}, { border: 2 }, { border: 1, format: "jpeg" as const }]) {
        for (const id of [BASILISK, RED]) {
          const art = id === RED ? potion([200, 60, 60]) : randomIcon(id);
          const upload = await screenshotCrop(art, { zoom, size: 51, ...crop });
          const best = ok(await index.similar(upload, { q: id === RED ? "potion 72" : "food basilisk" })).results[0];
          const what = `zoom ${zoom} ${JSON.stringify(crop)}: found ${best.zoom}`;
          expect(best.id, what).toBe(id);
          expect(Math.abs(best.zoom - zoom), what).toBeLessThanOrEqual(0.05);
        }
      }
    }
  });

  it("still finds an icon cropped with background around it (its zoom then reads low: the crop isn't the icon's edge)", async () => {
    const { index } = setup();
    const upload = await screenshotCrop(randomIcon(BASILISK), { zoom: 0.3, size: 51, border: 1, margin: 3 });
    const best = ok(await index.similar(upload, { q: "food" })).results[0];
    expect(best.id).toBe(BASILISK);
    expect(best.zoom).toBeLessThan(0.3);
  });

  it("compares a desaturated crop in grey, where a family that differs only in colour ties", async () => {
    const { index, casc } = setup();
    const upload = await screenshotCrop(casc.pixels.get(PURPLE)!, { grey: true });
    const grey = ok(await index.similar(upload, { q: "potion" }));
    expect(grey.mode).toBe("grey");
    expect(grey.saturation).toBeLessThan(0.06);
    expect(grey.results.slice(0, 3).map((r) => r.id).sort()).toEqual([RED, GREEN, PURPLE].sort());
    expect(grey.closeToBest).toBeGreaterThanOrEqual(3);

    const colourUpload = await screenshotCrop(casc.pixels.get(PURPLE)!);
    const colour = ok(await index.similar(colourUpload, { q: "potion" }));
    expect(colour.mode).toBe("colour");
    expect(colour.results[0].id).toBe(PURPLE);
    expect(colour.closeToBest).toBe(1);
    // Asked for grey, a colour crop is compared in grey too.
    expect(ok(await index.similar(colourUpload, { q: "potion", colour: "grey" })).mode).toBe("grey");
  });

  it("pages its answer", async () => {
    const { index } = setup();
    const upload = await screenshotCrop(randomIcon(BASILISK));
    const all = ok(await index.similar(upload, { q: "potion", limit: 100 }));
    const page = ok(await index.similar(upload, { q: "potion", offset: 1, limit: 2 }));
    expect(page).toMatchObject({ offset: 1, limit: 2, total: all.total });
    expect(page.results).toEqual(all.results.slice(1, 3));
  });

  it("without a filter, builds the whole index in the background first and says how long it will take", async () => {
    let clock = 0;
    const { index, casc, files } = setup({ concurrency: 3, delay: 2, now: () => clock });
    const icons = await files.listIcons(null);
    const upload = await screenshotCrop(randomIcon(BASILISK), { zoom: 0.24 });
    const first = await index.similar(upload);
    expect(first).toMatchObject({ status: "indexing", kind: "icon", total: icons.length, etaSeconds: null, retryAfter: 30, hint: expect.stringMatching(/q=/) });
    expect((await index.status()).building).toBe("icon");
    // Halfway, a second later: the speed and the time left are known.
    while ((await index.status()).icons.indexed < icons.length / 2) await new Promise((r) => setTimeout(r, 1));
    clock = 1000;
    const half = await index.similar(upload);
    if (half.status !== "indexing") throw new Error("expected progress");
    expect(half.perSecond).toBeGreaterThan(0);
    expect(half.etaSeconds).toBeGreaterThanOrEqual(1);
    expect(half.hint).toMatch(/left at/);
    await index.build();
    expect(casc.maxActive()).toBeLessThanOrEqual(3);
    expect(await index.status()).toMatchObject({ icons: { indexed: icons.length, failed: 0, total: icons.length }, building: null });
    const result = ok(await index.similar(upload));
    expect(result.query).toBeNull();
    expect(result.results[0].id).toBe(BASILISK);
    expect(result.total).toBe(icons.length - 2); // MISSING and BROKEN
    expect(new Set(casc.calls).size).toBe(casc.calls.length); // each icon downloaded once
  });

  it("tries failed downloads again, and once every icon was tried answers without the ones that still fail", async () => {
    const { index, casc, files } = setup({ failing: new Map([[RED, 1], [GREEN, Infinity]]) });
    const icons = await files.listIcons(null);
    await index.build();
    expect(casc.calls.filter((id) => id === RED)).toHaveLength(2); // failed once, then indexed
    expect(casc.calls.filter((id) => id === GREEN)).toHaveLength(3); // tried, and retried twice
    const status = await index.status();
    expect(status.icons).toEqual({ indexed: icons.length - 1, failed: 1, total: icons.length });
    expect(status.lastError).toMatch(/134853/);
    const result = ok(await index.similar(await screenshotCrop(randomIcon(BASILISK))));
    expect(result.results[0].id).toBe(BASILISK);
    expect(result.unavailable).toBe(3); // MISSING, BROKEN and GREEN
  });

  it("answers progress when a filter matches more unindexed icons than a search fetches", async () => {
    const { index, casc } = setup({ onDemandLimit: 2 });
    const upload = await screenshotCrop(randomIcon(BASILISK));
    expect(await index.similar(upload, { q: "potion" })).toMatchObject({ status: "indexing", hint: expect.stringMatching(/Narrow q/) });
    await index.build();
    expect(ok(await index.similar(upload, { q: "potion" })).total).toBeGreaterThan(2);
    expect(casc.calls.length).toBeGreaterThan(0);
  });

  it("keeps what it indexed and resumes, fetching again only icons whose download failed", async () => {
    const dbPath = path.join(mkdtempSync(path.join(tmpdir(), "aurasim-icons-")), "icon-features.sqlite");
    const first = setup({ dbPath, failing: new Map([[BASILISK, Infinity]]) });
    await first.index.build();
    const status = await first.index.status();
    expect(status.icons.indexed).toBe(status.icons.total - 1);
    first.index.close();

    const second = setup({ dbPath });
    await second.index.build();
    expect(second.casc.calls).toEqual([BASILISK]);
    expect((await second.index.status()).icons.indexed).toBe(status.icons.total);
  });
});

describe("texture index", () => {
  /** A cursor-like texture: a white arrow on a see-through square. */
  const ARROW = (() => {
    const data = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (x < y && x + y < 90) data.set([255, 240, 200, 255], (y * SIZE + x) * 4);
    return { width: SIZE, height: SIZE, data };
  })();
  const CAST = 131015; // Interface\CURSOR\Cast.blp

  /** The texture as the game shows it: drawn over a plain background colour. */
  async function onScreen(image: RgbaImage, background: string) {
    const png = await sharp(Buffer.from(image.data), { raw: { width: image.width, height: image.height, channels: 4 } }).resize(40, 40).png().toBuffer();
    const bytes = await sharp({ create: { width: 40, height: 40, channels: 4, background } }).composite([{ input: png }]).png().toBuffer();
    return decodeUpload(new Uint8Array(bytes));
  }

  it("finds the game's other textures and the addon's own (kind=texture), their see-through parts over the screenshot's background", async () => {
    const addonRead: string[] = [];
    const { index, casc } = setup({
      pixels: [[CAST, ARROW]],
      addonTextures: [
        { path: "Interface\\AddOns\\WeakAuras\\Media\\Textures\\Square_White", image: { width: SIZE, height: SIZE, data: new Uint8Array(SIZE * SIZE * 4).fill(255) } },
        { path: "Interface\\AddOns\\WeakAuras\\Media\\Textures\\Circle_Smooth", image: randomIcon(7) },
      ],
      addonRead,
    });
    const icons = ok(await index.similar(await onScreen(ARROW, "#204060"), { q: "cast" }));
    expect(icons.kind).toBe("icon");
    expect(icons.total).toBe(0); // no icon is called "cast"

    const arrow = await index.similar(await onScreen(ARROW, "#204060"), { kind: "texture", q: "cursor" });
    if (arrow.status !== "ok" || arrow.kind !== "texture") throw new Error(JSON.stringify(arrow));
    expect(arrow.results[0]).toMatchObject({ id: CAST, path: "Interface\\CURSOR\\Cast", from: "game" });
    expect(casc.calls).toEqual([CAST]);

    // Without q, every texture is compared once the texture index is built.
    const first = await index.similar(await onScreen(ARROW, "#000000"), { kind: "texture" });
    expect(first).toMatchObject({ status: "indexing", kind: "texture" });
    await index.build(["texture"]);
    const all = await index.similar(await onScreen(ARROW, "#000000"), { kind: "texture" });
    if (all.status !== "ok" || all.kind !== "texture") throw new Error(JSON.stringify(all));
    expect(all.results[0]).toMatchObject({ id: CAST, from: "game" });
    expect(all.results.map((r) => r.path)).toContain("Interface\\AddOns\\WeakAuras\\Media\\Textures\\Square_White");
    expect(addonRead).toHaveLength(2);
    expect((await index.status()).textures).toEqual({ indexed: 6, failed: 0, total: 6 }); // 4 game textures, 2 of the addon's

    const white = await index.similar(await onScreen({ width: SIZE, height: SIZE, data: new Uint8Array(SIZE * SIZE * 4).fill(255) }, "#000000"), {
      kind: "texture",
      q: "square",
    });
    if (white.status !== "ok" || white.kind !== "texture") throw new Error(JSON.stringify(white));
    expect(white.results).toEqual([expect.objectContaining({ id: null, path: "Interface\\AddOns\\WeakAuras\\Media\\Textures\\Square_White", from: "addon" })]);
  });
});

describe("uploads", () => {
  it("reads PNG, JPEG and WebP (grey ones as RGB), shrunk to at most 128 pixels a side", async () => {
    const raw = { raw: { width: 300, height: 200, channels: 3 as const } };
    const pixels = Buffer.alloc(300 * 200 * 3, 120);
    for (const bytes of [await sharp(pixels, raw).png().toBuffer(), await sharp(pixels, raw).jpeg().toBuffer(), await sharp(pixels, raw).webp().toBuffer()]) {
      const image = await decodeUpload(new Uint8Array(bytes));
      expect([image.width, image.height]).toEqual([128, 85]);
      expect(image.data.length).toBe(128 * 85 * 4);
    }
    const grey = await decodeUpload(new Uint8Array(await sharp(pixels, raw).greyscale().png().toBuffer()));
    expect(grey.data.length).toBe(grey.width * grey.height * 4);
  });

  it("refuses what isn't a PNG, JPEG or WebP", async () => {
    await expect(decodeUpload(new TextEncoder().encode("hello"))).rejects.toThrow(BadUploadError);
    const gif = await sharp(Buffer.alloc(16 * 16 * 3), { raw: { width: 16, height: 16, channels: 3 } }).gif().toBuffer();
    await expect(decodeUpload(new Uint8Array(gif))).rejects.toThrow(/gif/);
  });
});
