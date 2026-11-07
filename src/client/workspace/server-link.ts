import {
  CLIENT_HEADER,
  EVENTS,
  eventsUrl,
  pushUrl,
  snapshotUrl,
  type WorkspaceAddress,
  type WorkspaceNotice,
  type WorkspaceSnapshot,
} from "@/workspace";

/** A push from the server: its state code and time. */
export interface ServerPush {
  code: string;
  updatedAt: string;
}

export interface LinkEnv {
  fetch: typeof fetch;
  /** Missing where the browser has none (then the page works on its own). */
  EventSource?: typeof EventSource;
  /** How long `latest` waits for the server's first answer. */
  timeoutMs?: number;
}

const browserEnv = (): LinkEnv => ({
  fetch: (...args) => fetch(...args),
  EventSource: typeof EventSource === "undefined" ? undefined : EventSource,
});

/**
 * One page's link to a workspace on the server (see `@/workspace` protocol): the server's latest push when the page
 * opens, pushes from elsewhere as they come (fetched one revision at a time, in order, skipping the page's own), and
 * the page's own changes sent as pushes. Offline or without a server, it answers nothing and the page works alone.
 */
export class ServerLink {
  /** Identifies this page's pushes in the event stream. */
  readonly clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  private readonly env: LinkEnv;
  private events: EventSource | null = null;
  private disposed = false;
  /** The newest revision handed over (or skipped as current when the page opened). */
  private revision = 0;
  private readonly queue: number[] = [];
  private pulling = false;
  private onPush: ((push: ServerPush) => void) | null = null;
  /** The latest situation an agent set (JSON, as the server sent it), until someone follows it. */
  private situation: unknown = undefined;
  private onSituation: ((situation: unknown) => void) | null = null;

  constructor(
    private readonly workspace: WorkspaceAddress,
    env?: LinkEnv,
  ) {
    this.env = env ?? browserEnv();
  }

  /**
   * Subscribes to the workspace's events and resolves with the server's latest push, or null when it has none or
   * doesn't answer in time. Notices after it wait until `follow`.
   */
  latest(): Promise<ServerPush | null> {
    const { EventSource: Source, timeoutMs = 3000 } = this.env;
    if (this.disposed || !Source) return Promise.resolve(null);
    const events = new Source(eventsUrl(this.workspace));
    this.events = events;
    return new Promise((resolve) => {
      let first = true;
      const timer = setTimeout(() => {
        first = false;
        resolve(null);
      }, timeoutMs);
      const onNotice = (ev: Event) => {
        let notice: WorkspaceNotice;
        try {
          notice = JSON.parse((ev as MessageEvent<string>).data);
        } catch {
          return;
        }
        if (first) {
          first = false;
          clearTimeout(timer);
          if (!notice.revision) return resolve(null);
          void this.fetchSnapshot().then((snap) => {
            if (snap) this.revision = Math.max(this.revision, snap.revision);
            resolve(snap?.code && snap.updatedAt ? { code: snap.code, updatedAt: snap.updatedAt } : null);
          });
          return;
        }
        if (notice.revision <= this.revision || notice.source === this.clientId) return;
        this.queue.push(notice.revision);
        void this.pull();
      };
      events.addEventListener(EVENTS.snapshot, onNotice);
      events.addEventListener(EVENTS.state, onNotice);
      events.addEventListener(EVENTS.situation, (ev) => {
        try {
          this.situation = JSON.parse((ev as MessageEvent<string>).data);
        } catch {
          return;
        }
        this.onSituation?.(this.situation);
      });
    });
  }

  /** Hands every later push from elsewhere to `onPush`, in order (including any that arrived since `latest`). */
  follow(onPush: (push: ServerPush) => void) {
    this.onPush = onPush;
    void this.pull();
  }

  /**
   * Hands the situation an agent set for the workspace to `onSituation` (as JSON, for `readSituation`): the one set
   * before the page opened, if any, then every change.
   */
  followSituation(onSituation: (situation: unknown) => void) {
    this.onSituation = onSituation;
    if (this.situation !== undefined) onSituation(this.situation);
  }

  /** Sends a change made on this page, so other pages and agents see it. */
  async push(code: string) {
    try {
      // The page validates in the browser; the server only checks the code decodes.
      await this.env.fetch(pushUrl(this.workspace, { validate: false }), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8", [CLIENT_HEADER]: this.clientId },
        body: code,
      });
    } catch {
      // Offline or no server: the page keeps working on its own.
    }
  }

  dispose() {
    this.disposed = true;
    this.events?.close();
    this.events = null;
  }

  /** The latest snapshot, or a given recent revision (the latest when that one is no longer kept). */
  private async fetchSnapshot(revision?: number): Promise<WorkspaceSnapshot | null> {
    try {
      const get = (r?: number) => this.env.fetch(snapshotUrl(this.workspace, r), { cache: "no-store" });
      let res = await get(revision);
      if (res.status === 404 && revision) res = await get();
      if (!res.ok) return null;
      const body = (await res.json()) as Partial<WorkspaceSnapshot>;
      return {
        id: this.workspace.id,
        code: typeof body.code === "string" ? body.code : null,
        revision: typeof body.revision === "number" ? body.revision : 0,
        updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
        source: typeof body.source === "string" ? body.source : null,
      };
    } catch {
      return null;
    }
  }

  private async pull() {
    if (this.pulling || !this.onPush) return;
    this.pulling = true;
    try {
      while (this.queue.length && !this.disposed) {
        const wanted = this.queue.shift()!;
        if (wanted <= this.revision) continue;
        const snap = await this.fetchSnapshot(wanted);
        if (!snap || this.disposed) continue;
        if (snap.code && snap.source !== this.clientId && snap.revision > this.revision) {
          this.onPush({ code: snap.code, updatedAt: snap.updatedAt ?? new Date().toISOString() });
        }
        this.revision = Math.max(this.revision, snap.revision);
      }
    } finally {
      this.pulling = false;
    }
  }
}
