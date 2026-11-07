/**
 * The page's side of the game's file list (`GET /api/<game>/files`): a texture path to its FileDataID, so any game
 * texture path an aura names (`Interface\Cursor\Cast`, `Interface\Icons\NAME`) can be downloaded. Lookups made in
 * the same tick go in one request; answers are kept for the page's lifetime.
 */
import { gameFileKey, type FileLookupResult } from "@/api/files";
import { fetchJson } from "@/lib/fetch-json";

/** A texture path's FileDataID, or null when the game has no such file. Rejects when the file list can't be asked. */
export type ResolvePath = (path: string) => Promise<number | null>;

const MAX_PER_REQUEST = 200;

/** Path lookups against a file endpoint (e.g. "/api/tbc/files"). */
export function gameFilesFromApi(url: string, fetchList: (url: string) => Promise<FileLookupResult> = fetchJson): ResolvePath {
  const known = new Map<string, Promise<number | null>>();
  let queue: { path: string; resolve: (id: number | null) => void; reject: (err: unknown) => void }[] = [];

  async function flush(batch: typeof queue) {
    for (let i = 0; i < batch.length; i += MAX_PER_REQUEST) {
      const part = batch.slice(i, i + MAX_PER_REQUEST);
      const params = new URLSearchParams();
      for (const { path } of part) params.append("path", path);
      try {
        const answer = await fetchList(`${url}?${params}`);
        for (const p of part) p.resolve(answer.paths[p.path]?.id ?? null);
      } catch (err) {
        for (const p of part) p.reject(err);
      }
    }
  }

  return (path) => {
    const key = gameFileKey(path);
    let p = known.get(key);
    if (!p) {
      p = new Promise<number | null>((resolve, reject) => {
        if (queue.length === 0) {
          setTimeout(() => {
            const batch = queue;
            queue = [];
            void flush(batch);
          }, 0);
        }
        queue.push({ path, resolve, reject });
      });
      // A failed request is asked again next time.
      p.catch(() => known.delete(key));
      known.set(key, p);
    }
    return p;
  };
}
