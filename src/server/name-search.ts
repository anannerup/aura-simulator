/**
 * Name search over a SQLite column of lower-case names: every word of the query must occur; exact matches first,
 * then prefix, then word-start, then anywhere. Used by the item and icon searches.
 */

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface NameQuery {
  /** SQL condition (all words occur in `column`). */
  where: string;
  /** SQL rank expression: 0 exact, 1 prefix, 2 word start, 3 anywhere. */
  rank: string;
  /** Named parameters of both. */
  params: Record<string, string>;
}

/**
 * The query's SQL parts for `column` (holding normalized names). `separators` are the characters that start a word in
 * the names besides a space (icon names: `_`).
 */
export function nameQuery(query: string, column: string, separators = " "): NameQuery {
  const q = normalizeName(query);
  const words = q.split(" ").filter(Boolean);
  const params: Record<string, string> = { q, prefix: `${escapeLike(q)}%` };
  words.forEach((w, i) => (params[`w${i}`] = `%${escapeLike(w)}%`));
  const wordStarts = [...separators].map((sep, i) => {
    params[`word${i}`] = `%${sep === "_" ? "\\_" : sep}${escapeLike(q)}%`;
    return `${column} LIKE :word${i} ESCAPE '\\'`;
  });
  return {
    where: words.length ? words.map((_, i) => `${column} LIKE :w${i} ESCAPE '\\'`).join(" AND ") : "0",
    rank: `CASE WHEN ${column} = :q THEN 0 WHEN ${column} LIKE :prefix ESCAPE '\\' THEN 1
      WHEN ${wordStarts.join(" OR ")} THEN 2 ELSE 3 END`,
    params,
  };
}

/** The most results one search answers. */
export const MAX_SEARCH_LIMIT = 100;

/** One page of a search: skip `offset` results (0-based), answer at most `limit` (1-100, 20 by default). */
export interface SearchPage {
  offset: number;
  limit: number;
}

/** A page from optional numbers: `limit` clamped to 1-100 (20 by default), `offset` to 0 or more (0 by default). */
export function searchPage(page: { offset?: number; limit?: number } = {}): SearchPage {
  return {
    offset: Math.max(0, Math.floor(page.offset ?? 0)),
    limit: Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.floor(page.limit ?? 20))),
  };
}

/**
 * A search's `offset` and `limit` query parameters as a page, or the error to answer (400) when either is given but
 * isn't a number (an offset must be a whole number of 0 or more). Every search route pages through this.
 */
export function parseSearchPage(params: URLSearchParams): SearchPage | { error: string } {
  const read = (name: string): number | undefined | null => {
    const raw = params.get(name);
    if (raw === null || raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const limit = read("limit");
  const offset = read("offset");
  if (limit === null) return { error: `limit must be a number (1-${MAX_SEARCH_LIMIT})` };
  if (offset === null || (offset !== undefined && (!Number.isInteger(offset) || offset < 0))) {
    return { error: "offset must be a whole number of 0 or more (the results to skip)" };
  }
  return searchPage({ offset, limit });
}
