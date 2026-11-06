import type { NextRequest } from "next/server";
import { getSpellCache } from "@/server/spells";

const MAX_IDS = 200;

function parseIds(raw: string | null): number[] | null {
  if (raw === null || raw.trim() === "") return [];
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length > MAX_IDS || !parts.every((p) => /^\d+$/.test(p))) return null;
  return parts.map(Number);
}

/**
 * GET /api/icons?files=<FileDataID,...>&spells=<spell ID,...> (up to 200 each)
 * → `{files: {"135932": "spell_holy_magicalsentry" | null}, spells: {"1459": ... | null}}`.
 * Icon names are lower case without extension; images at
 * `https://wow.zamimg.com/images/wow/icons/large/<name>.jpg`. No network.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const files = parseIds(params.get("files"));
  const spells = parseIds(params.get("spells"));
  if (!files || !spells) {
    return Response.json(
      { error: `files and spells must be comma-separated positive integers (at most ${MAX_IDS} each)` },
      { status: 400 },
    );
  }
  return Response.json(getSpellCache().icons({ files, spells }));
}
