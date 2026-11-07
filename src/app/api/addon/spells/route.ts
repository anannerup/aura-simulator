import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { MAX_CLIENT_SPELL_IDS } from "@/api/addon";
import { clientSpells } from "@/server/addon";
import { getSpellCache } from "@/server/spells";

/**
 * GET /api/addon/spells?ids=<spell ID,...> (up to MAX_CLIENT_SPELL_IDS): what the Forever client knows about these spells,
 * for the addon VM's C_Spell.GetSpellInfo and friends → `{"1459": {"name": "Arcane Intellect", "icon": 135932} | null}`.
 * `icon` is a FileDataID (or a texture path). Unknown spells are null, as in the game. No network.
 */
export async function GET(request: NextRequest) {
  await connection();
  const raw = request.nextUrl.searchParams.get("ids") ?? "";
  const parts = raw === "" ? [] : raw.split(",").map((s) => s.trim());
  if (parts.length > MAX_CLIENT_SPELL_IDS || !parts.every((p) => /^\d+$/.test(p))) {
    return Response.json(
      { error: `ids must be comma-separated positive integers (at most ${MAX_CLIENT_SPELL_IDS})` },
      { status: 400 },
    );
  }
  return Response.json(await clientSpells(getSpellCache(), parts.map(Number)));
}
