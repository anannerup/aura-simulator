import { plainText } from "@/core";

/**
 * The addon's spell/item inputs return "shown text\0raw text" from get(): the input shows the first
 * part (e.g. "1459 (Arcane Intellect)") and edits the second (WeakAurasInput widgets).
 */
export function splitInputValue(value: unknown): { shown: string; raw: string } {
  const text = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  const i = text.indexOf("\0");
  return i < 0 ? { shown: text, raw: text } : { shown: text.slice(0, i), raw: text.slice(i + 1) };
}

/** The addon's texture path for an option image, reduced to its file name (expand, collapse, delete, …). */
export function imageName(image: string | undefined): string {
  if (!image) return "";
  const parts = image.split(/[\\/]/);
  return parts[parts.length - 1].replace(/\.(tga|blp)$/i, "").toLowerCase();
}

export interface TextRun {
  text: string;
  /** CSS colour from a `|cAARRGGBB` escape, or undefined for the default colour. */
  color?: string;
}

/** Splits WoW UI text into runs by its `|cAARRGGBB…|r` colour escapes (other escapes removed). */
export function colorRuns(text: unknown): TextRun[] {
  if (typeof text !== "string") return [{ text: plainText(text) }];
  const runs: TextRun[] = [];
  let color: string | undefined;
  for (const part of text.split(/(\|c[0-9a-fA-F]{8}|\|r)/)) {
    if (/^\|c[0-9a-fA-F]{8}$/.test(part)) color = `#${part.slice(4)}`;
    else if (part === "|r") color = undefined;
    else if (part) {
      const plain = plainText(part);
      if (plain) runs.push({ text: plain, color });
    }
  }
  return runs;
}
