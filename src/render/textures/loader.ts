import { forever } from "@/games/forever";
import { decodeTexture, type DecodedTexture } from "./decode";
import { textureUrls, type TextureSource } from "./paths";
import { cropTexture, shadePixels, type TextureVariant } from "./pixels";

export interface TextureLoaderOptions {
  /** fetch implementation (tests inject a mock). */
  fetch?: typeof fetch;
  /**
   * Persistent byte cache. Defaults to Cache Storage when available; `null` disables it.
   * Every access is guarded: a failing store only means a refetch.
   */
  persistentCache?: Pick<CacheStorage, "open"> | null;
  /** Musca Auras git ref used for addon-shipped textures. */
  addonRef?: string;
  /** Turns RGBA pixels into a URL usable as an <img> src / CSS background. Defaults to a canvas PNG blob URL. */
  encode?: (tex: DecodedTexture) => Promise<string>;
}

export interface TextureLoader {
  /** Raw file bytes (memory → Cache Storage → network): textures, and other game files such as fonts. */
  loadBytes(source: TextureSource): Promise<Uint8Array>;
  /** Decoded RGBA. */
  load(source: TextureSource): Promise<DecodedTexture>;
  /** URL of the (optionally cropped / desaturated / tinted) texture, cached per variant. */
  url(source: TextureSource, variant?: TextureVariant): Promise<TextureUrl>;
}

export interface TextureUrl {
  url: string;
  width: number;
  height: number;
}

const TEXTURE_CACHE_NAME = "aura-sim-textures-v1";

async function defaultEncode(tex: DecodedTexture): Promise<string> {
  const pixels = new Uint8ClampedArray(tex.data);
  const imageData = new ImageData(pixels, tex.width, tex.height);
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(tex.width, tex.height);
    canvas.getContext("2d")!.putImageData(imageData, 0, 0);
    return URL.createObjectURL(await canvas.convertToBlob({ type: "image/png" }));
  }
  const canvas = document.createElement("canvas");
  canvas.width = tex.width;
  canvas.height = tex.height;
  canvas.getContext("2d")!.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function defaultPersistentCache(): Pick<CacheStorage, "open"> | null {
  try {
    return typeof caches !== "undefined" ? caches : null;
  } catch {
    return null;
  }
}

export function createTextureLoader(options: TextureLoaderOptions = {}): TextureLoader {
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const persistent = options.persistentCache === undefined ? defaultPersistentCache() : options.persistentCache;
  const addonRef = options.addonRef ?? forever.addon.fallbackRef;
  const encode = options.encode ?? defaultEncode;

  const bytesCache = new Map<string, Promise<Uint8Array>>();
  const decodedCache = new Map<string, Promise<DecodedTexture>>();
  const urlCache = new Map<string, Promise<TextureUrl>>();

  async function fetchOne(url: string): Promise<Uint8Array | null> {
    let store: Cache | null = null;
    try {
      store = persistent ? await persistent.open(TEXTURE_CACHE_NAME) : null;
      const hit = await store?.match(url);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
    } catch {
      store = null;
    }
    const res = await doFetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    try {
      await store?.put(url, new Response(bytes.slice().buffer, { headers: { "content-type": "application/octet-stream" } }));
    } catch {
      // storage full or unavailable: the memory cache still holds it
    }
    return bytes;
  }

  function key(source: TextureSource) {
    return typeof source === "number" ? `fdid:${source}` : `path:${source}`;
  }

  function loadBytes(source: TextureSource): Promise<Uint8Array> {
    const k = key(source);
    let p = bytesCache.get(k);
    if (!p) {
      p = (async () => {
        const urls = textureUrls(source, addonRef);
        for (const url of urls) {
          const bytes = await fetchOne(url);
          if (bytes) return bytes;
        }
        throw new Error(`Texture not found: ${source} (${urls.join(", ")})`);
      })();
      p.catch(() => bytesCache.delete(k));
      bytesCache.set(k, p);
    }
    return p;
  }

  function load(source: TextureSource): Promise<DecodedTexture> {
    const k = key(source);
    let p = decodedCache.get(k);
    if (!p) {
      p = loadBytes(source).then(decodeTexture);
      p.catch(() => decodedCache.delete(k));
      decodedCache.set(k, p);
    }
    return p;
  }

  function url(source: TextureSource, variant: TextureVariant = {}): Promise<TextureUrl> {
    const k = `${key(source)}|${variant.desaturate ? 1 : 0}|${variant.tint?.join(",") ?? ""}|${variant.crop?.join(",") ?? ""}`;
    let p = urlCache.get(k);
    if (!p) {
      p = load(source).then(async (tex) => {
        const cropped = variant.crop ? cropTexture(tex, variant.crop) : tex;
        const plain = !variant.desaturate && !variant.tint;
        const shaded = plain ? cropped : { ...cropped, data: shadePixels(cropped.data, variant) };
        return { url: await encode(shaded), width: shaded.width, height: shaded.height };
      });
      p.catch(() => urlCache.delete(k));
      urlCache.set(k, p);
    }
    return p;
  }

  return { loadBytes, load, url };
}

let shared: TextureLoader | null = null;

/** The app-wide loader (memory cache shared by every renderer). */
export function textureLoader(): TextureLoader {
  shared ??= createTextureLoader();
  return shared;
}
