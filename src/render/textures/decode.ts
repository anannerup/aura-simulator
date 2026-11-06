import { Blp, BLP_IMAGE_FORMAT } from "@wowserhq/format";
import TGA from "tga-js";

/** A decoded texture: straight (non-premultiplied) RGBA bytes, row-major, top row first. */
export interface DecodedTexture {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function isBlp(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x42 && bytes[1] === 0x4c && bytes[2] === 0x50 && bytes[3] === 0x32; // "BLP2"
}

/** Decodes a BLP2 or TGA file (the two formats WoW textures ship in) to RGBA. */
export function decodeTexture(bytes: Uint8Array): DecodedTexture {
  if (isBlp(bytes)) {
    const blp = new Blp();
    blp.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    // IMAGE_ABGR8888 is little-endian ABGR, i.e. bytes in R,G,B,A order: what canvas ImageData wants.
    const image = blp.getImage(0, BLP_IMAGE_FORMAT.IMAGE_ABGR8888);
    return {
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    };
  }
  const tga = new TGA();
  tga.load(bytes);
  const { width, height } = tga.header;
  const out = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  tga.getImageData(out);
  return out;
}
