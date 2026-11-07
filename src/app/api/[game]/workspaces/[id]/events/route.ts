import { connection, type NextRequest } from "next/server";
import { situationJson } from "@/core";
import { EVENTS, type WorkspaceNotice } from "@/workspace";
import { routeGame } from "@/games/server";
import { getWorkspaceHub, notice, rejectWorkspaceId } from "@/server/workspaces";

const HEARTBEAT_MS = 20_000;

/**
 * GET /api/<game>/workspaces/<id>/events: Server-Sent Events. First `event: snapshot` with a notice of the workspace's
 * current state (`{id, revision, updatedAt, source}`), then `event: state` with a notice on every push or page
 * change; `event: situation` with the situation an agent set (`situationJson`), on connect when one is set and on
 * every change; a comment line as heartbeat. Notices carry no code (codes can be megabytes): fetch
 * `GET /api/<game>/workspaces/<id>?revision=<n>` for it.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/[game]/workspaces/[id]/events">) {
  await connection();
  const { game, id } = await ctx.params;
  const server = routeGame(game);
  if (server instanceof Response) return server;
  const hub = getWorkspaceHub(server.game.id);
  const rejected = rejectWorkspaceId(id);
  if (rejected) return rejected;

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = hub.subscribe(id, (n: WorkspaceNotice) => {
        send(`event: ${EVENTS.state}\ndata: ${JSON.stringify(n)}\n\n`);
      });
      const unsubscribeSituation = hub.subscribeSituation(id, (s) => {
        send(`event: ${EVENTS.situation}\ndata: ${JSON.stringify(situationJson(s))}\n\n`);
      });
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        unsubscribeSituation();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", () => cleanup());
      send(`retry: 2000\nevent: ${EVENTS.snapshot}\ndata: ${JSON.stringify(notice(hub.get(id)))}\n\n`);
      const situation = hub.getSituation(id);
      if (situation) send(`event: ${EVENTS.situation}\ndata: ${JSON.stringify(situationJson(situation))}\n\n`);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
