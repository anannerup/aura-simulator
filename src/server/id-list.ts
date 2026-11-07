/** A query parameter of comma-separated IDs (digits only): [] when absent or empty, null when malformed or over `max`. */
export function parseIdList(raw: string | null, max: number): number[] | null {
  if (raw === null || raw.trim() === "") return [];
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length > max || !parts.every((p) => /^\d+$/.test(p))) return null;
  return parts.map(Number);
}
