import { connection } from "next/server";
import { getSpellCache, iconUrl } from "@/server/spells";

/** GET /api/icons/<fileDataId>: `{fileDataId, icon, iconUrl}` for an Interface\ICONS file; 404 (same body) when unknown. */
export async function GET(_request: Request, { params }: { params: Promise<{ fileDataId: string }> }) {
  await connection();
  const { fileDataId: raw } = await params;
  const fileDataId = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(fileDataId) || fileDataId <= 0) {
    return Response.json({ error: "FileDataID must be a positive integer" }, { status: 400 });
  }
  const icon = getSpellCache().icons({ files: [fileDataId] }).files[fileDataId] ?? null;
  return Response.json({ fileDataId, icon, iconUrl: icon ? iconUrl(icon) : null }, { status: icon ? 200 : 404 });
}
