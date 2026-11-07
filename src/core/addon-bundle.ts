/**
 * Addon bundles: every source file a loader needs, collected into one `{ path: source }` map so a
 * browser can fetch them in one request instead of one request per file.
 *
 * - "light": what `loadAddon` reads for encode/decode (ADDON_FILES).
 * - "full": that, plus everything the full addon VM reads: each addon's .toc, the XML files it
 *   includes and the Lua files they expand to (the same expansion `loadAddonVM` uses).
 */
import { ADDON_FILES, type AddonSourceFetcher } from "./addon-source";
import { FULL_VM_ADDONS, addonLoadOrder, type AddonGameId } from "./addon-vm/toc";

export type AddonBundleSet = "light" | "full";

export const ADDON_BUNDLE_SETS: readonly AddonBundleSet[] = ["light", "full"];

export interface AddonBundle {
  /** The (immutable, when known) ref the files were read at. */
  ref: string;
  set: AddonBundleSet;
  /** Repo-relative path → file text, as the fetcher returned it. */
  files: Record<string, string>;
}

/**
 * Reads every file of a bundle set through `fetchSource`. The file list is not hard-coded: the full
 * set records what the VM's load-order expansion asks for, from the .toc files `game`'s client reads.
 */
export async function collectAddonBundle(
  fetchSource: AddonSourceFetcher,
  ref: string,
  set: AddonBundleSet,
  game: AddonGameId = "forever",
): Promise<AddonBundle> {
  const files = new Map<string, Promise<string>>();
  const read: AddonSourceFetcher = (path) => {
    let text = files.get(path);
    if (!text) {
      text = fetchSource(path);
      files.set(path, text);
    }
    return text;
  };
  await Promise.all(Object.values(ADDON_FILES).map(read));
  if (set === "full") {
    await Promise.all(
      FULL_VM_ADDONS.map(async (addon) => {
        const { files: luaFiles } = await addonLoadOrder(read, addon, game);
        await Promise.all(luaFiles.map((f) => read(`${addon}/${f}`)));
      }),
    );
  }
  const paths = [...files.keys()].sort();
  const texts = await Promise.all(paths.map((p) => files.get(p)!));
  return { ref, set, files: Object.fromEntries(paths.map((p, i) => [p, texts[i]])) };
}

/** Serves files from a bundle, asking `fallback` for anything the bundle doesn't hold. */
export function bundleFetcher(bundle: Pick<AddonBundle, "files">, fallback: AddonSourceFetcher): AddonSourceFetcher {
  return async (path) => (Object.hasOwn(bundle.files, path) ? bundle.files[path] : fallback(path));
}
