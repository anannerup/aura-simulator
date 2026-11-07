/**
 * A PNG of any texture an aura can name, to look at (the similar-texture search links each hit to it): a FileDataID,
 * a game path (found in the game's file list, downloaded from wago.tools) or one of the addon's own files
 * (`Interface\AddOns\…`, `.tga` or `.blp` when the path has no extension, as the game resolves them).
 */
import sharp from "sharp";
import { decodeTexture } from "@/render/textures/decode";
import { fileDataIdUrl, isAddonPath } from "@/render/textures/paths";
import type { GameFiles } from "@/server/game-files";
import type { FetchFn } from "@/server/spells/sources";

export interface TextureSources {
  files: Pick<GameFiles, "lookup">;
  /** One of the addon's files by its path in the addon (`WeakAuras/Media/Textures/Square_White.tga`); throws when missing. */
  readAddonFile(path: string): Promise<Uint8Array>;
  fetch?: FetchFn;
}

/** The texture's bytes, or null when there is no such file. */
async function textureBytes(sources: TextureSources, texture: string): Promise<Uint8Array | null> {
  const fetchFn: FetchFn = sources.fetch ?? ((input, init) => fetch(input, init));
  const trimmed = texture.trim();
  let id: number | null = null;
  if (/^\d+$/.test(trimmed)) id = Number(trimmed);
  else if (isAddonPath(trimmed)) {
    const rel = trimmed.replace(/\\/g, "/").replace(/^\/?interface\/addons\//i, "");
    for (const candidate of /\.(tga|blp)$/i.test(rel) ? [rel] : [`${rel}.tga`, `${rel}.blp`]) {
      try {
        return await sources.readAddonFile(candidate);
      } catch {
        // the next extension
      }
    }
    return null;
  } else id = (await sources.files.lookup({ paths: [trimmed] })).paths[trimmed]?.id ?? null;
  if (id === null) return null;
  const res = await fetchFn(fileDataIdUrl(id));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`wago.tools answered ${res.status} for FileDataID ${id}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** The texture as a PNG; null when there is no such file. Throws when it can't be downloaded or read. */
export async function texturePicture(sources: TextureSources, texture: string): Promise<Buffer | null> {
  const bytes = await textureBytes(sources, texture);
  if (!bytes) return null;
  const image = decodeTexture(bytes);
  return sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
