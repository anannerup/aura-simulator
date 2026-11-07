/** A tiny tokenizer for syntax colors in the JSON editor. Only colors; the real parsing is `JSON.parse`. */

export type TokenClass = "string" | "number" | "keyword" | "key" | "punct" | "plain";

export interface Span {
  text: string;
  cls: TokenClass;
}

const JSON_TOKENS =
  /("(?:[^"\\\n]|\\.)*"?)(?=(\s*:)?)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\]:,])/g;

export function highlightJson(text: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  JSON_TOKENS.lastIndex = 0;
  for (let m = JSON_TOKENS.exec(text); m; m = JSON_TOKENS.exec(text)) {
    if (m[0] === "") {
      JSON_TOKENS.lastIndex++;
      continue;
    }
    if (m.index > last) out.push({ text: text.slice(last, m.index), cls: "plain" });
    const cls: TokenClass =
      m[1] !== undefined ? (m[2] ? "key" : "string") : m[3] !== undefined ? "number" : m[4] !== undefined ? "keyword" : "punct";
    out.push({ text: m[0], cls });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), cls: "plain" });
  return out;
}
