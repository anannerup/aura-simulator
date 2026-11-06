import { connection } from "next/server";
import { getSpellCache } from "@/server/spells";

/** GET /api/spells/<id>: spell info with flags; 404 (same body) when no source knows the ID. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id: raw } = await params;
  const id = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(id) || id <= 0) {
    return Response.json({ error: "Spell ID must be a positive integer" }, { status: 400 });
  }
  const spell = await getSpellCache().lookup(id);
  return Response.json(spell, { status: spell.found ? 200 : 404 });
}
