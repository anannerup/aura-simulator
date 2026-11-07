import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { MAX_CLIENT_SPELL_IDS } from "@/api/addon";
import { routeGame } from "@/games/server";
import { clientSpells } from "@/server/addon";
import { parseIdList } from "@/server/id-list";

/**
 * GET /api/<game>/addon/spells?ids=<spell ID,...> (up to MAX_CLIENT_SPELL_IDS): what the game client knows about these
 * spells, for the addon VM's C_Spell.GetSpellInfo and friends → `{"1459": {"name": "Arcane Intellect", "icon": 135932} | null}`.
 * `icon` is a FileDataID (or a texture path). Unknown spells are null, as in the game. No network.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/addon/spells">) {
  await connection();
  const server = routeGame((await ctx.params).game);
  if (server instanceof Response) return server;
  const ids = parseIdList(request.nextUrl.searchParams.get("ids"), MAX_CLIENT_SPELL_IDS);
  if (!ids) {
    return Response.json(
      { error: `ids must be comma-separated positive integers (at most ${MAX_CLIENT_SPELL_IDS})` },
      { status: 400 },
    );
  }
  return Response.json(await clientSpells(server.spells, ids));
}
