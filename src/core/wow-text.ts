/**
 * WoW UI text: the escape sequences a FontString interprets (https://warcraft.wiki.gg/wiki/UI_escape_sequences).
 * `|cAARRGGBB` colours the text up to the next `|r` (or the next `|c`); `|r` returns to the font string's own colour;
 * `||` is a literal `|`; `|n` a line break; `|T…|t` (texture) and `|A…|a` (atlas) are inline images; a hyperlink
 * `|H…|h<text>|h` shows its text. Anything else after `|` is shown as written.
 */

export interface WowTextSpan {
  text: string;
  /** CSS colour (`#RRGGBB`) from a `|cAARRGGBB` escape; undefined for the font string's own colour. */
  color?: string;
}

/**
 * An image inside the text, in the text's units. `height` 0 is the font's height; `width` 0 (or left out) is the same
 * as the height. The offsets move it right and up from where it sits on the line.
 */
export interface WowInlineImageSize {
  height: number;
  width: number;
  offsetX: number;
  offsetY: number;
  /** Vertex colour (0..1) the image is multiplied by. */
  color?: [number, number, number];
}

/**
 * `|Tfile:height:width:offsetX:offsetY:textureWidth:textureHeight:left:right:top:bottom:r:g:b|t`: a texture by path or
 * FileDataID, the texel rectangle as texture coordinates (0..1, SetTexCoord order), the colour in 0..255.
 */
export interface WowInlineTexture extends WowInlineImageSize {
  kind: "texture";
  file: string;
  texCoord?: [number, number, number, number];
}

/** `|A:atlas:height:width:offsetX:offsetY:r:g:b|a`: an atlas member by name. */
export interface WowInlineAtlas extends WowInlineImageSize {
  kind: "atlas";
  name: string;
}

export type WowInlineImage = WowInlineTexture | WowInlineAtlas;

/** A piece of WoW text: a span of text in one colour, or an inline image. */
export type WowTextRun = WowTextSpan | { image: WowInlineImage };

/** The numbers after an image's name (`:16:16:0:0`), missing or unreadable ones as 0. */
function numbers(parts: string[]): number[] {
  return parts.map((p) => {
    const n = Number(p.trim());
    return Number.isFinite(n) ? n : 0;
  });
}

const vertexColor = (rgb: number[]): [number, number, number] | undefined =>
  rgb.length === 3 ? [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255] : undefined;

/** `|T…|t`'s inside (without `|T` and `|t`). */
function inlineTexture(spec: string): WowInlineTexture {
  const [file, ...rest] = spec.split(":");
  const [height = 0, width = 0, offsetX = 0, offsetY = 0, texWidth = 0, texHeight = 0, ...more] = numbers(rest);
  const image: WowInlineTexture = { kind: "texture", file: file.trim(), height, width, offsetX, offsetY };
  if (more.length >= 4 && texWidth > 0 && texHeight > 0) {
    image.texCoord = [more[0] / texWidth, more[1] / texWidth, more[2] / texHeight, more[3] / texHeight];
    const color = vertexColor(more.slice(4, 7));
    if (color) image.color = color;
  }
  return image;
}

/** `|A…|a`'s inside (without `|A` and `|a`). */
function inlineAtlas(spec: string): WowInlineAtlas {
  const [name, ...rest] = spec.replace(/^:/, "").split(":");
  const [height = 0, width = 0, offsetX = 0, offsetY = 0, ...more] = numbers(rest);
  const image: WowInlineAtlas = { kind: "atlas", name: name.trim(), height, width, offsetX, offsetY };
  const color = vertexColor(more.slice(0, 3));
  if (color) image.color = color;
  return image;
}

/**
 * Splits WoW text into runs by its colour escapes and inline images (`|T…|t` textures, `|A…|a` atlases), with the
 * other escapes resolved (`||`, `|n`, hyperlink text). Adjacent spans of one colour are merged.
 */
export function wowTextRuns(text: unknown): WowTextRun[] {
  if (typeof text !== "string") return [{ text: text === undefined || text === null ? "" : String(text) }];
  const runs: WowTextRun[] = [];
  let color: string | undefined;
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    const last = runs[runs.length - 1];
    if (last && "text" in last && last.color === color) last.text += buffer;
    else runs.push(color ? { text: buffer, color } : { text: buffer });
    buffer = "";
  };
  const escape = /\|(?:\||c([0-9a-fA-F]{8})|r|n|T([^|]*)\|t|A([^|]*)\|a|H[^|]*\|h|h)/g;
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
    } else if (code === "T" || code === "A") {
      flush();
      runs.push({ image: code === "T" ? inlineTexture(m[2]) : inlineAtlas(m[3]) });
    }
    // |H…|h and the closing |h: the link's text between them stays.
  }
  buffer += text.slice(at);
  flush();
  return runs;
}

/** WoW UI text (option names, addon messages) as plain text: escapes resolved, inline images left out (see `wowTextRuns`). */
export function plainText(text: unknown): string {
  return wowTextRuns(text)
    .map((r) => ("text" in r ? r.text : ""))
    .join("");
}
