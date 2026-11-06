declare module "tga-js" {
  interface TgaHeader {
    width: number;
    height: number;
    pixelDepth: number;
  }
  interface TgaImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  export default class TGA {
    header: TgaHeader;
    load(data: Uint8Array): void;
    getImageData<T extends TgaImageData>(imageData?: T): T;
  }
}
