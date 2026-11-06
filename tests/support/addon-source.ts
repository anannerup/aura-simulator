import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { jsDelivrFetcher, type AddonSourceFetcher } from "@/core/addon-source";

/**
 * jsDelivr fetcher with a disk cache under .cache/addon/<ref>/ (gitignored), so tests run against
 * the real addon version but download each file only once.
 */
export function cachedAddonFetcher(ref: string): AddonSourceFetcher {
  const remote = jsDelivrFetcher(ref);
  const root = path.resolve(__dirname, "../../.cache/addon", ref);
  return async (file) => {
    const local = path.join(root, file);
    try {
      return await readFile(local, "utf8");
    } catch {
      const text = await remote(file);
      await mkdir(path.dirname(local), { recursive: true });
      await writeFile(local, text);
      return text;
    }
  };
}
