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
