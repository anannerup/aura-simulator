import { connection } from "next/server";
import { getSpellCache } from "@/server/spells";

/** GET /api/spells/status: synced build, spell counts, Wowhead cache counts. */
export async function GET() {
  await connection();
  return Response.json(getSpellCache().status());
}
