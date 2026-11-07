/** A game's LibSharedMedia lists at an addon version, from the addon itself running in the server's aura core. */
import { MEDIA_TYPES, mediaFrom, type MediaLists, type MediaType } from "@/api/media";
import { getServerAuraCore, resolveServerRef } from "@/server/addon/core";
import type { ServerGame } from "@/server/game";
import type { AddonTexture } from "@/server/icon-index";

type RawMedia = Partial<Record<MediaType, { list?: { name: string; file?: string | number }[] | Record<string, never>; default?: string }>>;

/** The media lists of the game's addon version (default: the newest), with the font sample page's URL for `origin`. */
export async function loadGameMedia(server: ServerGame, origin: string, requestedRef?: string | null): Promise<MediaLists> {
  const { ref } = await resolveServerRef(server, requestedRef);
  const raw = ((await (await getServerAuraCore(server, ref)).registries()).media ?? {}) as RawMedia;
  const types = Object.fromEntries(
    MEDIA_TYPES.map((type) => {
      const list = Array.isArray(raw[type]?.list) ? raw[type].list : [];
      return [
        type,
        {
          default: raw[type]?.default ?? null,
          entries: list.map((e) => ({ name: e.name, file: e.file ?? "", from: mediaFrom(e.file ?? "") })),
        },
      ];
    }),
  ) as MediaLists["types"];
  const fontSamples = `${origin}/${server.game.id}/fonts?ref=${encodeURIComponent(ref)}`;
  return { ref, types, fontSamples };
}

/**
 * The addon's own textures (every `.tga`/`.blp` file of its folders) at the default release, as the paths an aura
 * writes for them (`Interface\AddOns\WeakAuras\Media\Textures\Square_White`): the icon index's `kind=texture` searches
 * them with the game's textures.
 */
export async function addonTextureFiles(server: ServerGame): Promise<AddonTexture[]> {
  const { ref } = await resolveServerRef(server);
  const { listing } = await server.addon.listFiles(ref);
  return listing.files
    .filter((f) => /\.(tga|blp)$/i.test(f.path))
    .map((f) => ({
      path: `Interface\\AddOns\\${f.path.replace(/\.(tga|blp)$/i, "").replace(/\//g, "\\")}`,
      read: async () => (await server.addon.readFile(ref, f.path)).bytes,
    }));
}
