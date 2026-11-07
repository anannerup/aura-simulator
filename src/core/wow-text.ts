/** WoW UI text (option names, addon messages) as plain text: colour, texture and atlas escapes removed. */
export function plainText(text: unknown): string {
  if (typeof text !== "string") return text === undefined || text === null ? "" : String(text);
  return text
    .replace(/\|c[0-9a-fA-F]{8}/g, "")
    .replace(/\|r/g, "")
    .replace(/\|T[^|]*\|t/g, "")
    .replace(/\|A[^|]*\|a/g, "")
    .replace(/\|n/g, "\n")
    .replace(/\|\|/g, "|");
}
