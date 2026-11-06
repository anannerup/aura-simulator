import type { AuraCore, AuraDocument, DecodedState } from "@/core";
import {
  addSubtree,
  buildSearch,
  findNode,
  mergeTopLevel,
  mergeWorkspaces,
  needsShortLink,
  newerWorkspace,
  nodeFromState,
  nodeId,
  parseAddress,
  parseBundle,
  stateKey,
  readWorkspace,
  serializeWorkspace,
  stateFromNode,
  storageKey,
  TreeError,
  updateNode,
  workspaceFromStates,
  type Workspace,
  type WorkspaceNode,
} from "@/workspace";

/** What the page shows of the workspace. */
export interface WorkspaceView {
  /** The workspace the page follows (from `?w=`, else "default"); null until restored. */
  workspaceId: string | null;
  /** Every top-level item; empty until restored (or when the player removed everything). */
  items: WorkspaceNode[];
  /** The selected item's id. */
  selectedId: string | null;
  /** The selected item's state code (a group's includes its descendants). */
  code: string | null;
  /** The selected item's document. */
  aura: AuraDocument | null;
  /** The selected group's descendants, flattened as in its state code. */
  children: AuraDocument[];
  /** True once restored. */
  ready: boolean;
  /** Something the player should know about the restore (e.g. a broken link); null when all is well. */
  notice: string | null;
}

export const EMPTY_VIEW: WorkspaceView = {
  workspaceId: null,
  items: [],
  selectedId: null,
  code: null,
  aura: null,
  children: [],
  ready: false,
  notice: null,
};

export type LoadResult = { ok: true } | { ok: false; error: string };

const SNAPSHOT_TIMEOUT_MS = 3000;

/** Where a change came from: the page itself (edits, paste, address, storage) or the server (a push). */
type Origin = "page" | "server";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One page's connection to a workspace: restores it (address, then the newer of browser storage and the server),
 * keeps address, storage and server in step with every change, and follows pushes over Server-Sent Events.
 *
 * - Address: a one-item workspace is `?code=` (or a short link when long); several items are a short link to the
 *   bundle of their codes (`?s=`).
 * - Server: each top-level item a page change touched is sent as a push; a push from elsewhere is merged into
 *   the top level (replacing the item with the same uid, else id; see `mergeTopLevel`).
 *
 * Create one per aura core; `dispose` stops it.
 */
export class WorkspaceSession {
  private view: WorkspaceView = EMPTY_VIEW;
  private disposed = false;
  private events: EventSource | null = null;
  private addressSeq = 0;
  /** Codes this page sent to the server whose echo hasn't come back yet. */
  private readonly sent = new Set<string>();
  /** Encoded state code per node (nodes are immutable, so identity is a safe key). */
  private readonly codes = new WeakMap<WorkspaceNode, string>();
  /** Codes seen (decoded, stored, encoded) by content (`stateKey`): a re-encode would change the table order. */
  private readonly known = new Map<string, string>();

  constructor(
    private readonly core: AuraCore,
    private readonly onChange: (view: WorkspaceView) => void,
  ) {}

  async start(fallbackCode: string): Promise<void> {
    const address = parseAddress(window.location.search);
    const id = address.workspaceId;
    let notice: string | null = null;

    let codes: string[] | null = address.code ? [address.code] : null;
    if (!codes && address.shortId) {
      codes = await this.resolveShortLink(address.shortId);
      if (this.disposed) return;
      if (!codes) notice = `Short link ${address.shortId} was not found.`;
    }
    // Subscribe first: the server's snapshot is the remote candidate, and no push is missed after it.
    const remote = await this.follow(id);
    if (this.disposed) return;

    if (codes) {
      try {
        const ws = workspaceFromStates(codes.map((c) => this.decode(c)));
        this.commit(id, ws.items, ws.selected ?? null, "page", null, ws.updatedAt);
        return;
      } catch (e) {
        notice = `The address holds a state code that doesn't load: ${errorText(e)}`;
      }
    }
    const local = this.readStorage(id);
    let remoteWs: Workspace | null = null;
    if (remote) {
      try {
        remoteWs = workspaceFromStates([this.decode(remote.code)], remote.updatedAt);
      } catch {
        remoteWs = null;
      }
    }
    if (local && remoteWs && newerWorkspace(local, remoteWs) === remoteWs) {
      // A push arrived since this browser last saved: merge it like a live push.
      const merged = mergeTopLevel(local.items, remoteWs.items[0]);
      this.commit(id, merged.items, merged.id, "server", notice, remoteWs.updatedAt);
      return;
    }
    const chosen = local ?? remoteWs;
    if (chosen) {
      this.commit(id, chosen.items, chosen.selected ?? null, chosen === remoteWs ? "server" : "page", notice, chosen.updatedAt);
      return;
    }
    const ws = workspaceFromStates([this.decode(fallbackCode)]);
    this.commit(id, ws.items, ws.selected ?? null, "page", notice);
  }

  /** Opens a pasted state code as the whole workspace. On failure nothing changes. */
  load(code: string): LoadResult {
    return this.withCode(code, (node) => ({ items: [node], selected: nodeId(node) }));
  }

  /** Adds a pasted state code (an aura, or a group with its subtree) to the top level. */
  importCode(code: string): LoadResult {
    return this.withCode(code, (node) => {
      const added = addSubtree(this.view.items, node, { parentId: null });
      return { items: added.items, selected: added.id };
    });
  }

  /** Replaces the tree (an edit from the tree UI) and the selection. */
  setItems(items: WorkspaceNode[], selectedId: string | null): LoadResult {
    const id = this.view.workspaceId;
    if (!id) return { ok: false, error: "The workspace is still loading" };
    try {
      this.commit(id, items, selectedId, "page");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorText(e) };
    }
  }

  select(selectedId: string) {
    const id = this.view.workspaceId;
    if (!id || selectedId === this.view.selectedId || !findNode(this.view.items, selectedId)) return;
    this.view = this.withSelection(this.view, this.view.items, selectedId);
    this.onChange(this.view);
    this.writeStorage(id, { items: this.view.items, updatedAt: new Date().toISOString(), selected: selectedId });
  }

  /** Replaces the selected item's document (from an editor). A changed `id` renames it. */
  updateSelected(doc: AuraDocument): LoadResult {
    const id = this.view.workspaceId;
    const selected = this.view.selectedId;
    if (!id || !selected) return { ok: false, error: "Nothing is selected" };
    try {
      const updated = updateNode(this.view.items, selected, doc);
      this.commit(id, updated.items, updated.id, "page");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorText(e) };
    }
  }

  /** The workspace file (JSON) of the current workspace. */
  exportFile(): string {
    return serializeWorkspace(
      { items: this.view.items, updatedAt: new Date().toISOString(), selected: this.view.selectedId },
      { pretty: true, codeOf: this.codeOfNode },
    );
  }

  /** Checks a workspace file without changing anything. */
  checkFile(text: string): { ok: true; items: WorkspaceNode[]; selected: string | null } | { ok: false; error: string } {
    const result = readWorkspace(text, (c) => this.decode(c));
    if (!result.ok) return result;
    this.learn(result.codes);
    return { ok: true, items: result.workspace.items, selected: result.workspace.selected ?? null };
  }

  /** Loads a workspace file: replaces the workspace, or adds its items to it. */
  importFile(text: string, mode: "replace" | "merge"): LoadResult {
    const id = this.view.workspaceId;
    if (!id) return { ok: false, error: "The workspace is still loading" };
    const checked = this.checkFile(text);
    if (!checked.ok) return checked;
    try {
      if (mode === "replace") this.commit(id, checked.items, checked.selected, "page");
      else {
        const before = this.view.items.length;
        const items = mergeWorkspaces(this.view.items, checked.items);
        this.commit(id, items, items[before] ? nodeId(items[before]) : this.view.selectedId, "page");
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorText(e) };
    }
  }

  dispose() {
    this.disposed = true;
    this.events?.close();
    this.events = null;
  }

  private withCode(code: string, apply: (node: WorkspaceNode) => { items: WorkspaceNode[]; selected: string }): LoadResult {
    const id = this.view.workspaceId;
    if (!id) return { ok: false, error: "The workspace is still loading" };
    const trimmed = code.trim();
    if (!trimmed) return { ok: false, error: "Paste a state code first" };
    try {
      const node = nodeFromState(this.decode(trimmed));
      const next = apply(node);
      this.commit(id, next.items, next.selected, "page");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof TreeError ? e.message : errorText(e) };
    }
  }

  /** Decodes a code and remembers it for its content, so an unchanged item keeps showing the very same code. */
  private decode(code: string): DecodedState {
    const state = this.core.decode(code);
    this.known.set(stateKey(state), code);
    return state;
  }

  /** Remembers codes a file or storage carries (those that don't decode are ignored). */
  private learn(codes: string[]) {
    for (const code of codes) {
      try {
        this.decode(code);
      } catch {
        // not for this addon version, or broken: it'll be encoded afresh
      }
    }
  }

  /** An item's state code: a code it was loaded from when the content is the same, else freshly encoded. */
  private codeOf(node: WorkspaceNode): string {
    let code = this.codes.get(node);
    if (!code) {
      const state = stateFromNode(node);
      const key = stateKey(state);
      code = this.known.get(key) ?? this.core.encode(state);
      this.known.set(key, code);
      this.codes.set(node, code);
    }
    return code;
  }

  private readonly codeOfNode = (node: WorkspaceNode) => this.codeOf(node);

  private withSelection(view: WorkspaceView, items: WorkspaceNode[], selectedId: string | null): WorkspaceView {
    const found = selectedId ? findNode(items, selectedId) : null;
    const node = found?.node ?? items[0] ?? null;
    if (!node) return { ...view, items, selectedId: null, code: null, aura: null, children: [] };
    const state = stateFromNode(node);
    return { ...view, items, selectedId: nodeId(node), code: this.codeOf(node), aura: node.aura, children: state.children };
  }

  /** Makes `items` the workspace: view, storage, address and (for page changes) the server follow. */
  private commit(
    id: string,
    items: WorkspaceNode[],
    selectedId: string | null,
    origin: Origin,
    notice: string | null = null,
    updatedAt: string = new Date().toISOString(),
  ) {
    if (this.disposed) return;
    const before = new Set(this.view.items.map((n) => this.codeOf(n)));
    const topCodes = items.map((n) => this.codeOf(n)); // throws (and changes nothing) if the addon can't encode it
    this.view = this.withSelection({ ...this.view, workspaceId: id, ready: true, notice }, items, selectedId);
    this.onChange(this.view);
    this.writeStorage(id, { items, updatedAt, selected: this.view.selectedId });
    void this.updateAddress(id, topCodes);
    if (origin === "page") for (const code of topCodes) if (!before.has(code)) void this.pushToServer(id, code);
  }

  private readStorage(workspaceId: string): Workspace | null {
    try {
      const result = readWorkspace(window.localStorage.getItem(storageKey(workspaceId)), (c) => this.decode(c));
      if (!result.ok) return null;
      this.learn(result.codes);
      return result.workspace;
    } catch {
      return null;
    }
  }

  private writeStorage(workspaceId: string, workspace: Workspace) {
    try {
      window.localStorage.setItem(storageKey(workspaceId), serializeWorkspace(workspace, { codeOf: this.codeOfNode }));
    } catch {
      // Storage blocked or full: the address still holds the state.
    }
  }

  /** A server push (or a change from another page): merged into the top level and selected. */
  private adoptRemote(id: string, code: string, updatedAt: string) {
    if (this.view.items.some((n) => this.codeOf(n) === code)) return;
    try {
      const merged = mergeTopLevel(this.view.items, nodeFromState(this.decode(code)));
      this.commit(id, merged.items, merged.id, "server", null, updatedAt);
    } catch {
      // Not decodable here (e.g. another addon version): ignore.
    }
  }

  /**
   * Subscribes to the workspace's events. Resolves with the server's snapshot (sent first on every connection),
   * or null if the server doesn't answer in time. Later snapshots and `state` events are merged when they bring a
   * code this page didn't send itself.
   */
  private follow(id: string): Promise<{ code: string; updatedAt: string } | null> {
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
          resolve(snap.code && snap.updatedAt ? { code: snap.code, updatedAt: snap.updatedAt } : null);
          return;
        }
        if (!this.view.ready || !snap.code) return;
        if (this.sent.delete(snap.code)) return; // our own change coming back
        this.adoptRemote(id, snap.code, snap.updatedAt ?? new Date().toISOString());
      };
      events.addEventListener("snapshot", onSnapshot);
      events.addEventListener("state", onSnapshot);
    });
  }

  private async updateAddress(id: string, codes: string[]) {
    const seq = ++this.addressSeq;
    let search = buildSearch({ workspaceId: id });
    if (codes.length === 1 && !needsShortLink(codes[0])) {
      search = buildSearch({ workspaceId: id, code: codes[0] });
    } else if (codes.length > 0) {
      const shortId = await this.createShortLink(codes);
      if (shortId) search = buildSearch({ workspaceId: id, shortId });
    }
    if (this.disposed || seq !== this.addressSeq) return;
    const url = `${window.location.pathname}${search}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", url);
    }
  }

  private async resolveShortLink(shortId: string): Promise<string[] | null> {
    try {
      const res = await fetch(`/api/short-links/${encodeURIComponent(shortId)}`);
      if (!res.ok) return null;
      const body = (await res.json()) as { code?: unknown; codes?: unknown };
      if (Array.isArray(body.codes) && body.codes.every((c) => typeof c === "string")) return body.codes as string[];
      return typeof body.code === "string" ? (parseBundle(body.code) ?? [body.code]) : null;
    } catch {
      return null;
    }
  }

  private async createShortLink(codes: string[]): Promise<string | null> {
    try {
      const res = await fetch("/api/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(codes.length === 1 ? { code: codes[0] } : { codes }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { id?: unknown };
      return typeof body.id === "string" ? body.id : null;
    } catch {
      return null;
    }
  }

  /** Tells the server (and so other pages and agents) about an item changed on this page. */
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
