import { connection, type NextRequest } from "next/server";
import { EVENTS, type WorkspaceNotice } from "@/workspace";
import { getWorkspaceHub, notice, rejectWorkspaceId } from "@/server/workspaces";

const HEARTBEAT_MS = 20_000;

/**
 * GET /api/workspaces/<id>/events: Server-Sent Events. First `event: snapshot` with a notice of the workspace's
 * current state (`{id, revision, updatedAt, source}`), then `event: state` with a notice on every push or page
 * change; a comment line as heartbeat. Notices carry no code (codes can be megabytes): fetch
 * `GET /api/workspaces/<id>?revision=<n>` for it.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/workspaces/[id]/events">) {
  await connection();
  const { id } = await ctx.params;
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
      const unsubscribe = getWorkspaceHub().subscribe(id, (n: WorkspaceNotice) => {
        send(`event: ${EVENTS.state}\ndata: ${JSON.stringify(n)}\n\n`);
      });
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", () => cleanup());
      send(`retry: 2000\nevent: ${EVENTS.snapshot}\ndata: ${JSON.stringify(notice(getWorkspaceHub().get(id)))}\n\n`);
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
