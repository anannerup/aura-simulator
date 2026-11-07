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

/** A search limit: 1-100, 20 by default. */
export function searchLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(100, Math.floor(limit ?? 20)));
}
