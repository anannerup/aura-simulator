/** A tiny tokenizer for syntax colors in the raw editor. Only colors; the real parsing is in @/core. */

export type TokenClass = "comment" | "string" | "number" | "keyword" | "key" | "punct" | "plain";

export interface Span {
  text: string;
  cls: TokenClass;
}

const LUA =
  /(--\[(=*)\[[\s\S]*?(?:\]\2\]|$(?![\s\S]))|--[^\n]*)|(\[(=*)\[[\s\S]*?(?:\]\4\]|$(?![\s\S]))|"(?:[^"\\\n]|\\[\s\S])*"?|'(?:[^'\\\n]|\\[\s\S])*'?)|(-?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?))|([A-Za-z_]\w*)(?=(\s*=(?!=))?)|([{}[\]=,;])/g;

const JSON_TOKENS =
  /("(?:[^"\\\n]|\\.)*"?)(?=(\s*:)?)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\]:,])/g;

const LUA_KEYWORDS = new Set(["true", "false", "nil", "return"]);

function spans(text: string, re: RegExp, classify: (m: RegExpExecArray) => TokenClass): Span[] {
  const out: Span[] = [];
  let last = 0;
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) out.push({ text: text.slice(last, m.index), cls: "plain" });
    out.push({ text: m[0], cls: classify(m) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), cls: "plain" });
  return out;
}

export function highlight(text: string, mode: "lua" | "json"): Span[] {
  if (mode === "lua") {
    return spans(text, LUA, (m) => {
      if (m[1] !== undefined) return "comment";
      if (m[3] !== undefined) return "string";
      if (m[5] !== undefined) return "number";
      if (m[6] !== undefined) return LUA_KEYWORDS.has(m[6]) ? "keyword" : m[7] ? "key" : "plain";
      return "punct";
    });
  }
  return spans(text, JSON_TOKENS, (m) => {
    if (m[1] !== undefined) return m[2] ? "key" : "string";
    if (m[3] !== undefined) return "number";
    if (m[4] !== undefined) return "keyword";
    return "punct";
  });
}
