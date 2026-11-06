import { connection, type NextRequest } from "next/server";
import { isWorkspaceId } from "@/workspace";
import { getWorkspaceHub, type WorkspaceSnapshot } from "@/server/workspaces";

const HEARTBEAT_MS = 20_000;

/**
 * GET /api/workspaces/<id>/events: Server-Sent Events. First `event: snapshot` with the workspace's current
 * snapshot (`{id, code, updatedAt, revision}`), then `event: state` with it on every push or page change;
 * a comment line as heartbeat.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/workspaces/[id]/events">) {
  await connection();
  const { id } = await ctx.params;
  if (!isWorkspaceId(id)) return Response.json({ error: "Workspace IDs are 1-64 of A-Z a-z 0-9 _ -" }, { status: 400 });

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
      const unsubscribe = getWorkspaceHub().subscribe(id, (snap: WorkspaceSnapshot) => {
        send(`event: state\ndata: ${JSON.stringify(snap)}\n\n`);
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
      send(`retry: 2000\nevent: snapshot\ndata: ${JSON.stringify(getWorkspaceHub().get(id))}\n\n`);
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
