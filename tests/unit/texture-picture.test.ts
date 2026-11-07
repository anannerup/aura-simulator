/** A PNG of any texture an aura can name: a FileDataID, a game path or one of the addon's own files. */
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { TBC_SPELLS } from "@/games/tbc/sources";
import { createGameFiles } from "@/server/game-files";
import { texturePicture } from "@/server/texture-picture";
import { createTbcFixtureFetch } from "../fixtures/tbc/spells/fixture-fetch";

/** An uncompressed 32-bit 2×1 TGA, top-left origin: a red pixel and a half see-through blue one. */
const TGA = Uint8Array.from([0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 32, 0x28, 0, 0, 255, 255, 255, 0, 0, 128]);

async function pixels(png: Buffer | null) {
  if (!png) throw new Error("no picture");
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: [...data] };
}

describe("texture pictures", () => {
  const calls: string[] = [];
  const sources = {
    files: createGameFiles({ source: TBC_SPELLS, dbPath: ":memory:", fetch: createTbcFixtureFetch().fetch }),
    readAddonFile: async (path: string) => {
      calls.push(path);
      if (path === "WeakAuras/Media/Textures/Square_White.blp") return TGA;
      throw new Error("no such file");
    },
    fetch: async (url: string) => (url === "https://wago.tools/api/casc/131015" ? new Response(TGA) : new Response("", { status: 404 })),
  };

  it("draws a game path, a FileDataID and an addon path (trying .tga, then .blp) as a PNG", async () => {
    const expected = { width: 2, height: 1, data: [255, 0, 0, 255, 0, 0, 255, 128] };
    expect(await pixels(await texturePicture(sources, "Interface\\Cursor\\Cast"))).toEqual(expected);
    expect(await pixels(await texturePicture(sources, "131015"))).toEqual(expected);
    expect(await pixels(await texturePicture(sources, "Interface\\AddOns\\WeakAuras\\Media\\Textures\\Square_White"))).toEqual(expected);
    expect(calls).toEqual(["WeakAuras/Media/Textures/Square_White.tga", "WeakAuras/Media/Textures/Square_White.blp"]);
  });

  it("answers null for a file there isn't", async () => {
    expect(await texturePicture(sources, "Interface\\Nowhere\\Nothing")).toBeNull();
    expect(await texturePicture(sources, "130871")).toBeNull(); // in the file list, but wago.tools has no such file
    expect(await texturePicture(sources, "Interface\\AddOns\\WeakAuras\\Nothing")).toBeNull();
  });
});
