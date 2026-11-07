/**
 * The icon index: finding icons by how they look. TBC's recorded file list names the icons; their pixels are
 * synthetic 64×64 TGAs (decodeTexture reads TGA as well as BLP) served by a fake wago.tools, so no network is needed.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { IconSimilarResult } from "@/api/files";
import { TBC_SPELLS } from "@/games/tbc/sources";
import { createGameFiles } from "@/server/game-files";
import { BadUploadError, createIconIndex, decodeUpload, type RgbaImage } from "@/server/icon-index";
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

function fakeCasc(options: { failing?: Set<number>; delay?: number } = {}) {
  const pixels = new Map<number, RgbaImage>([
    [RED, potion([200, 60, 60])],
    [GREEN, potion([60, 130, 60])],
    [PURPLE, potion([161, 60, 161])],
  ]);
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
      if (options.failing?.has(id)) throw new TypeError("fetch failed: offline");
      if (id === MISSING) return new Response("", { status: 404 });
      if (id === BROKEN) return new Response("not a texture");
      return new Response(tga(pixels.get(id) ?? randomIcon(id)));
    } finally {
      active--;
    }
  };
  return { fetch, calls, pixels, maxActive: () => maxActive };
}

function setup(options: { dbPath?: string; failing?: Set<number>; concurrency?: number; onDemandLimit?: number; delay?: number } = {}) {
  const files = createGameFiles({ source: TBC_SPELLS, dbPath: ":memory:", fetch: createTbcFixtureFetch().fetch });
  const casc = fakeCasc(options);
  const index = createIconIndex({
    files,
    dbPath: options.dbPath ?? ":memory:",
    fetch: casc.fetch,
    concurrency: options.concurrency,
    onDemandLimit: options.onDemandLimit,
  });
  return { files, index, casc };
}

/** A player's crop of an icon: zoomed (`inset` cut off each edge), scaled to `size` pixels, a `border` around it. */
async function screenshotCrop(image: RgbaImage, { inset = 0, size = 36, border = 0, grey = false, format = "png" as "png" | "jpeg" } = {}) {
  const cut = Math.round(SIZE * inset);
  let pipeline = sharp(Buffer.from(image.data), { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .extract({ left: cut, top: cut, width: SIZE - 2 * cut, height: SIZE - 2 * cut })
    .resize(size, size);
  if (grey) pipeline = pipeline.greyscale();
  if (border) pipeline = pipeline.extend({ top: border, bottom: border, left: border, right: border, background: "#000" });
  const bytes = format === "png" ? await pipeline.png().toBuffer() : await pipeline.jpeg({ quality: 85 }).toBuffer();
  return decodeUpload(new Uint8Array(bytes));
}

const ok = (r: Awaited<ReturnType<ReturnType<typeof createIconIndex>["similar"]>>): IconSimilarResult => {
  if (r.status !== "ok") throw new Error(`expected an answer, got ${JSON.stringify(r)}`);
  return r;
};

describe("icon index", () => {
  it("with a name filter, indexes just the matching icons and finds a zoomed, bordered crop", async () => {
    const { index, casc, files } = setup();
    const upload = await screenshotCrop(randomIcon(BASILISK), { inset: 0.12, border: 2, format: "jpeg" });
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

  it("without a filter, builds the whole index in the background first, a few downloads at a time", async () => {
    const { index, casc, files } = setup({ concurrency: 3, delay: 2 });
    const icons = await files.listIcons(null);
    const upload = await screenshotCrop(randomIcon(BASILISK), { inset: 0.06 });
    const first = await index.similar(upload);
    expect(first).toMatchObject({ status: "indexing", total: icons.length, retryAfter: 30, hint: expect.stringMatching(/q=/) });
    expect((await index.status()).building).toBe(true);
    await index.build();
    expect(casc.maxActive()).toBeLessThanOrEqual(3);
    expect(await index.status()).toEqual({ indexed: icons.length, total: icons.length, building: false });
    const result = ok(await index.similar(upload));
    expect(result.query).toBeNull();
    expect(result.results[0].id).toBe(BASILISK);
    expect(result.total).toBe(icons.length - 2); // MISSING and BROKEN
    expect(new Set(casc.calls).size).toBe(casc.calls.length); // each icon downloaded once
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
    const first = setup({ dbPath, failing: new Set([BASILISK]) });
    await first.index.build();
    const status = await first.index.status();
    expect(status.indexed).toBe(status.total - 1);
    first.index.close();

    const second = setup({ dbPath });
    await second.index.build();
    expect(second.casc.calls).toEqual([BASILISK]);
    expect((await second.index.status()).indexed).toBe(status.total);
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
