import { describe, expect, it } from "vitest";
import { ServerLink, type ServerPush } from "@/client/workspace/server-link";
import { createWorkspaceHub, notice } from "@/server/workspaces";
import { CLIENT_HEADER } from "@/workspace";

/** A server in memory: the real hub behind fake `fetch` and `EventSource`, as the routes wire them. */
function fakeServer() {
  const hub = createWorkspaceHub();
  class FakeEventSource {
    private listeners = new Map<string, (ev: Event) => void>();
    constructor(url: string) {
      const id = decodeURIComponent(url.split("/")[4]);
      const emit = (event: string, data: unknown) => this.listeners.get(event)?.({ data: JSON.stringify(data) } as MessageEvent);
      hub.subscribe(id, (n) => queueMicrotask(() => emit("state", n)));
      queueMicrotask(() => emit("snapshot", notice(hub.get(id))));
    }
    addEventListener(event: string, listener: (ev: Event) => void) {
      this.listeners.set(event, listener);
    }
    close() {}
  }
  const fakeFetch = (async (input: string, init?: RequestInit) => {
    const url = new URL(input, "http://x");
    const id = decodeURIComponent(url.pathname.split("/")[4]);
    if (init?.method === "POST") {
      const source = (init.headers as Record<string, string>)[CLIENT_HEADER];
      return Response.json(hub.set(id, String(init.body), source));
    }
    const revision = url.searchParams.get("revision");
    const snap = revision ? hub.get(id, Number(revision)) : hub.get(id);
    return snap ? Response.json(snap) : new Response(null, { status: 404 });
  }) as typeof fetch;
  return { hub, env: { fetch: fakeFetch, EventSource: FakeEventSource as unknown as typeof EventSource, timeoutMs: 1000 } };
}

const settle = () => new Promise((r) => setTimeout(r, 10));

describe("server link", () => {
  it("answers null when the server has no push yet", async () => {
    const { env } = fakeServer();
    expect(await new ServerLink({ game: "forever", id: "w" }, env).latest()).toBeNull();
  });

  it("starts from the server's latest push, then hands over pushes from elsewhere in order, not its own", async () => {
    const { hub, env } = fakeServer();
    hub.set("w", "!WA:2!before");
    const link = new ServerLink({ game: "forever", id: "w" }, env);
    expect(await link.latest()).toMatchObject({ code: "!WA:2!before" });
    hub.set("w", "!WA:2!agent-1"); // arrives before the page follows: kept for it
    await settle();
    const heard: ServerPush[] = [];
    link.follow((p) => heard.push(p));
    await link.push("!WA:2!own");
    hub.set("w", "!WA:2!agent-2");
    await settle();
    expect(heard.map((p) => p.code)).toEqual(["!WA:2!agent-1", "!WA:2!agent-2"]);
    expect(hub.get("w", 3)).toMatchObject({ code: "!WA:2!own", source: link.clientId });
  });
});
