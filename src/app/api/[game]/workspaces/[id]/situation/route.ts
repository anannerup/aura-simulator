import { connection, type NextRequest } from "next/server";
import { routeGame } from "@/games/server";
import { errorMessage } from "@/lib/errors";
import { PushError, readBodyText, rejectWorkspaceId, setWorkspaceSituation, workspaceSituation } from "@/server/workspaces";

const SITUATION_BYTES = 64 * 1024;

function answerError(e: unknown): Response {
  if (e instanceof PushError) return Response.json({ error: e.message }, { status: e.status });
  return Response.json({ error: `Could not load the aura core: ${errorMessage(e)}` }, { status: 503 });
}

/**
 * GET /api/<game>/workspaces/<id>/situation → `{workspace, situation, set, preview}`: the workspace's situation and
 * what each display of its latest aura shows in it (`preview`, null before a push). `?ref=` picks the addon version.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/workspaces/[id]/situation">) {
  await connection();
  const { game, id } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const rejected = rejectWorkspaceId(id);
  if (rejected) return rejected;
  try {
    return Response.json(await workspaceSituation(server, id, request.nextUrl.searchParams.get("ref")), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return answerError(e);
  }
}

/**
 * PUT /api/<game>/workspaces/<id>/situation with a whole situation as JSON (`readSituation`; what is left out has its
 * default): open pages' game screens show it, later pushes answer in it. Answers as GET; 400 for a bad situation.
 */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/[game]/workspaces/[id]/situation">) {
  const { game, id } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const rejected = rejectWorkspaceId(id);
  if (rejected) return rejected;
  try {
    const body = await readBodyText(request, SITUATION_BYTES);
    return Response.json(await setWorkspaceSituation(server, id, body, request.nextUrl.searchParams.get("ref")));
  } catch (e) {
    return answerError(e);
  }
}
