import { getSpellCache } from "@/server/spells";

/** POST /api/spells/sync, optional JSON body {"build": "1.60.1.70790"} (default: latest wowf build). */
export async function POST(request: Request) {
  let build: string | undefined;
  const text = await request.text();
  if (text.trim() !== "") {
    try {
      const body = JSON.parse(text) as { build?: unknown };
      if (body.build !== undefined && typeof body.build !== "string") throw new Error("bad build");
      build = body.build as string | undefined;
    } catch {
      return Response.json({ error: 'Body must be empty or JSON like {"build": "1.60.1.70790"}' }, { status: 400 });
    }
  }
  try {
    return Response.json(await getSpellCache().sync({ build }));
  } catch (err) {
    return Response.json({ error: `Sync failed: ${(err as Error).message}` }, { status: 502 });
  }
}
