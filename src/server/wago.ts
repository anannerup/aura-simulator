/**
 * wago.io's data API: an aura's import string by its wago id (`GET https://data.wago.io/api/raw/encoded?id=<id>`,
 * text/plain, redirecting to the latest version; 404 `{"error":"page_not_found"}` for an unknown id). Every game's
 * wago links go through here; the addon's own import then decides whether the aura is for this game.
 *
 * Tests: WAGO_FIXTURES=<dir> answers from recorded import strings, `<dir>/<id>.txt` (e.g. `tests/fixtures/wago`),
 * and 404 for any other id, so nothing reaches wago.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isStateCode } from "@/core";
import { isWagoId, wagoEncodedUrl } from "@/workspace";
import type { FetchFn } from "./addon/upstream";

/** Why wago gave no import string; `status` is the HTTP status to answer with. */
export class WagoFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WagoFetchError";
  }
}

const TIMEOUT_MS = 15_000;

/** Recorded wago answers from WAGO_FIXTURES=<dir> (`<dir>/<id>.txt`), as wago would answer. */
export function createWagoFixtureFetch(dir: string): FetchFn {
  return async (input) => {
    const u = new URL(String(input));
    const id = u.searchParams.get("id") ?? "";
    if (u.host !== "data.wago.io" || u.pathname !== "/api/raw/encoded" || !isWagoId(id)) {
      return Response.json({ error: "page_not_found" }, { status: 404 });
    }
    try {
      const text = await readFile(path.join(dir, `${id}.txt`), "utf8");
      return new Response(text, { headers: { "Content-Type": "text/plain" } });
    } catch {
      return Response.json({ error: "page_not_found" }, { status: 404 });
    }
  };
}

function defaultFetch(): FetchFn {
  const fixtures = process.env.WAGO_FIXTURES;
  return fixtures ? createWagoFixtureFetch(path.resolve(fixtures)) : (input, init) => fetch(input, init);
}

/** The import string of the wago aura `id` (its latest version). Throws WagoFetchError. */
export async function fetchWagoCode(id: string, fetchFn: FetchFn = defaultFetch()): Promise<string> {
  if (!isWagoId(id)) throw new WagoFetchError(`"${id}" is not a wago id (letters, digits, - and _)`, 400);
  let res: Response;
  try {
    res = await fetchFn(wagoEncodedUrl(id), {
      headers: { Accept: "text/plain", "User-Agent": "aura-simulator" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new WagoFetchError(`Could not reach wago.io: ${e instanceof Error ? e.message : String(e)}`, 502);
  }
  if (res.status === 404) throw new WagoFetchError(`wago.io has no aura "${id}"`, 404);
  if (!res.ok) throw new WagoFetchError(`wago.io answered HTTP ${res.status} for "${id}"`, 502);
  const text = (await res.text()).trim();
  if (!isStateCode(text)) throw new WagoFetchError(`wago.io's answer for "${id}" is not an import string`, 502);
  return text;
}
