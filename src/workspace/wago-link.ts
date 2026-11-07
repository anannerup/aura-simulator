/**
 * Wago links: an aura on wago.io named by its link (`https://wago.io/LEPRolmHn`) or bare id (`LEPRolmHn`). The server
 * fetches its import string from wago's data API (`wagoEncodedUrl`); the page and the push API read links with
 * `parseWagoLink`. Pure, shared by page and server.
 */

/** A wago id: wago's own ids are 9-10 characters, custom slugs are letters, digits, `-` and `_`. */
const WAGO_ID = /^[A-Za-z0-9_-]{2,64}$/;

export type WagoLink = { ok: true; id: string } | { ok: false; error: string };

/**
 * Reads a wago link (`https://wago.io/<id>`, with or without scheme or `www.`), and with `bareId` a bare wago id
 * too (where the text can only mean wago, e.g. the Import box or a push's `wago` field). Null when the text isn't
 * meant as one (an import string, JSON, prose); an error when it is a wago link we can't import (a link to one
 * version, which wago's data API can't fetch by its number).
 */
export function parseWagoLink(text: string, options: { bareId?: boolean } = {}): WagoLink | null {
  const trimmed = text.trim();
  if (options.bareId && WAGO_ID.test(trimmed)) return { ok: true, id: trimmed };
  const m = /^(?:https?:\/\/)?(?:www\.)?wago\.io\/([^/?#\s]+)(\/[^?#\s]*)?(?:[?#]\S*)?$/i.exec(trimmed);
  if (!m) return null;
  const [, id, rest] = m;
  if (!WAGO_ID.test(id)) return { ok: false, error: `"${id}" is not a wago id (letters, digits, - and _)` };
  if (rest && rest !== "/") {
    return { ok: false, error: `Links to one version of a wago aren't supported; use https://wago.io/${id} for its latest version` };
  }
  return { ok: true, id };
}

/** Whether `id` is a wago id the server may ask wago for. */
export function isWagoId(id: string): boolean {
  return WAGO_ID.test(id);
}

/** wago's data API answer for an aura's import string (text/plain; it redirects to the latest version). */
export function wagoEncodedUrl(id: string): string {
  return `https://data.wago.io/api/raw/encoded?id=${encodeURIComponent(id)}`;
}

/** The page's way to a wago aura's import string: the game's server route. */
export function wagoRouteUrl(game: string, id: string): string {
  return `/api/${encodeURIComponent(game)}/wago/${encodeURIComponent(id)}`;
}
