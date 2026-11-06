import type { AuraCore, AuraDocument } from "@/core";
import {
  buildSearch,
  currentCode,
  needsShortLink,
  newerWorkspace,
  parseAddress,
  parseWorkspace,
  serializeWorkspace,
  storageKey,
  workspaceWithCode,
  type Workspace,
} from "@/workspace";

/** What the page shows of the workspace. */
export interface WorkspaceView {
  /** The workspace the page follows (from `?w=`, else "default"); null until restored. */
  workspaceId: string | null;
  /** The current state code, exactly as loaded; null until restored. */
  code: string | null;
  aura: AuraDocument | null;
  children: AuraDocument[];
  /** Something the player should know about the restore (e.g. a broken link); null when all is well. */
  notice: string | null;
}

export const EMPTY_VIEW: WorkspaceView = { workspaceId: null, code: null, aura: null, children: [], notice: null };

export type LoadResult = { ok: true } | { ok: false; error: string };

const SNAPSHOT_TIMEOUT_MS = 3000;

/** Where the code came from: the page itself (paste, address, storage) or the server (a push). */
type Origin = "page" | "server";

function readStorage(workspaceId: string): Workspace | null {
  try {
    return parseWorkspace(window.localStorage.getItem(storageKey(workspaceId)));
  } catch {
    return null;
  }
}

function writeStorage(workspaceId: string, workspace: Workspace) {
  try {
    window.localStorage.setItem(storageKey(workspaceId), serializeWorkspace(workspace));
  } catch {
    // Storage blocked or full: the address still holds the state.
  }
}

/**
 * One page's connection to a workspace: restores the state (address, then the newer of browser storage
 * and the server), keeps address, storage and server in step with every change, and follows pushes
 * over Server-Sent Events. Create one per aura core; `dispose` stops it.
 */
export class WorkspaceSession {
  private view: WorkspaceView = EMPTY_VIEW;
  private disposed = false;
  private events: EventSource | null = null;
  private addressSeq = 0;
  /** Codes this page sent to the server whose echo hasn't come back yet. */
  private readonly sent = new Set<string>();

  constructor(
    private readonly core: AuraCore,
    private readonly onChange: (view: WorkspaceView) => void,
  ) {}

  async start(fallbackCode: string): Promise<void> {
    const address = parseAddress(window.location.search);
    const id = address.workspaceId;
    let notice: string | null = null;

    let code = address.code;
    if (!code && address.shortId) {
      code = await this.resolveShortLink(address.shortId);
      if (this.disposed) return;
      if (!code) notice = `Short link ${address.shortId} was not found.`;
    }
    // Subscribe first: the server's snapshot is the remote candidate, and no push is missed after it.
    const remote = await this.follow(id);
    if (this.disposed) return;

    if (code) {
      const result = this.adopt(id, code, new Date().toISOString(), "page");
      if (result.ok) return;
      notice = `The address holds a state code that doesn't load: ${result.error}`;
    }
    const local = readStorage(id);
    for (const candidate of [newerWorkspace(local, remote), local, remote]) {
      const c = currentCode(candidate);
      if (!candidate || !c) continue;
      const origin: Origin = candidate === remote ? "server" : "page";
      if (this.adopt(id, c, candidate.updatedAt, origin, notice).ok) return;
    }
    this.adopt(id, fallbackCode, new Date().toISOString(), "page", notice);
  }

  /** Loads a pasted state code. On failure nothing changes. */
  load(code: string): LoadResult {
    const id = this.view.workspaceId;
    if (!id) return { ok: false, error: "The workspace is still loading" };
    const trimmed = code.trim();
    if (!trimmed) return { ok: false, error: "Paste a state code first" };
    return this.adopt(id, trimmed, new Date().toISOString(), "page");
  }

  dispose() {
    this.disposed = true;
    this.events?.close();
    this.events = null;
  }

  private adopt(id: string, code: string, updatedAt: string, origin: Origin, notice: string | null = null): LoadResult {
    if (this.disposed) return { ok: false, error: "Closed" };
    let decoded;
    try {
      decoded = this.core.decode(code);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    this.view = { workspaceId: id, code, aura: decoded.aura, children: decoded.children, notice };
    this.onChange(this.view);
    writeStorage(id, workspaceWithCode(code, updatedAt));
    void this.updateAddress(id, code);
    if (origin === "page") void this.pushToServer(id, code);
    return { ok: true };
  }

  /**
   * Subscribes to the workspace's events. Resolves with the server's snapshot (sent first on every
   * connection), or null if the server doesn't answer in time. Later snapshots (after a reconnect) and
   * `state` events are adopted when they bring a code this page didn't send itself.
   */
  private follow(id: string): Promise<Workspace | null> {
    if (this.disposed || typeof EventSource === "undefined") return Promise.resolve(null);
    const events = new EventSource(`/api/workspaces/${encodeURIComponent(id)}/events`);
    this.events = events;
    return new Promise((resolve) => {
      let first = true;
      const timer = setTimeout(() => {
        first = false;
        resolve(null);
      }, SNAPSHOT_TIMEOUT_MS);
      const onSnapshot = (ev: Event) => {
        let snap: { code: string | null; updatedAt: string | null };
        try {
          snap = JSON.parse((ev as MessageEvent<string>).data);
        } catch {
          return;
        }
        if (first) {
          first = false;
          clearTimeout(timer);
          resolve(snap.code && snap.updatedAt ? workspaceWithCode(snap.code, snap.updatedAt) : null);
          return;
        }
        if (!this.view.code || !snap.code) return;
        if (this.sent.delete(snap.code)) return; // our own change coming back
        if (snap.code !== this.view.code) {
          this.adopt(id, snap.code, snap.updatedAt ?? new Date().toISOString(), "server");
        }
      };
      events.addEventListener("snapshot", onSnapshot);
      events.addEventListener("state", onSnapshot);
    });
  }

  private async updateAddress(id: string, code: string) {
    const seq = ++this.addressSeq;
    let search = buildSearch({ workspaceId: id, code });
    if (needsShortLink(code)) {
      const shortId = await this.createShortLink(code);
      if (shortId) search = buildSearch({ workspaceId: id, shortId });
    }
    if (this.disposed || seq !== this.addressSeq) return;
    const url = `${window.location.pathname}${search}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", url);
    }
  }

  private async resolveShortLink(shortId: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/short-links/${encodeURIComponent(shortId)}`);
      if (!res.ok) return null;
      const body = (await res.json()) as { code?: unknown };
      return typeof body.code === "string" ? body.code : null;
    } catch {
      return null;
    }
  }

  private async createShortLink(code: string): Promise<string | null> {
    try {
      const res = await fetch("/api/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { id?: unknown };
      return typeof body.id === "string" ? body.id : null;
    } catch {
      return null;
    }
  }

  /** Tells the server (and so other pages and agents) about a change made on this page. */
  private async pushToServer(id: string, code: string) {
    if (this.events) this.sent.add(code);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}/aura`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) this.sent.delete(code);
    } catch {
      this.sent.delete(code);
      // Offline or no server: the page keeps working on its own.
    }
  }
}
