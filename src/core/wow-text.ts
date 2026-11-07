/**
 * WoW UI text: the escape sequences a FontString interprets (https://warcraft.wiki.gg/wiki/UI_escape_sequences).
 * `|cAARRGGBB` colours the text up to the next `|r` (or the next `|c`); `|r` returns to the font string's own colour;
 * `||` is a literal `|`; `|n` a line break; `|T…|t` (texture) and `|A…|a` (atlas) are inline images; a hyperlink
 * `|H…|h<text>|h` shows its text. Anything else after `|` is shown as written.
 */

export interface WowTextRun {
  text: string;
  /** CSS colour (`#RRGGBB`) from a `|cAARRGGBB` escape; undefined for the font string's own colour. */
  color?: string;
}

/**
 * Splits WoW text into runs by its colour escapes, with the other escapes resolved (`||`, `|n`, hyperlink text) or
 * removed (inline textures and atlases, which aren't drawn). Adjacent runs of one colour are merged.
 */
export function wowTextRuns(text: unknown): WowTextRun[] {
  if (typeof text !== "string") return [{ text: text === undefined || text === null ? "" : String(text) }];
  const runs: WowTextRun[] = [];
  let color: string | undefined;
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.text += buffer;
    else runs.push(color ? { text: buffer, color } : { text: buffer });
    buffer = "";
  };
  const escape = /\|(?:\||c([0-9a-fA-F]{8})|r|n|T[^|]*\|t|A[^|]*\|a|H[^|]*\|h|h)/g;
  let at = 0;
  for (let m = escape.exec(text); m; m = escape.exec(text)) {
    buffer += text.slice(at, m.index);
    at = m.index + m[0].length;
    const code = m[0][1];
    if (code === "|") buffer += "|";
    else if (code === "n") buffer += "\n";
    else if (code === "c" || code === "r") {
      flush();
      color = code === "c" ? `#${m[1].slice(2)}` : undefined;
    }
    // |T…|t, |A…|a: not drawn; |H…|h and the closing |h: the link's text between them stays.
  }
  buffer += text.slice(at);
  flush();
  return runs;
}

/** WoW UI text (option names, addon messages) as plain text: escapes resolved or removed (see `wowTextRuns`). */
export function plainText(text: unknown): string {
  return wowTextRuns(text)
    .map((r) => r.text)
    .join("");
}
