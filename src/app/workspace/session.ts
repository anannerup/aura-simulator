import type { AuraCore, AuraDocument, DecodedState } from "@/core";
import {
  addSubtree,
  auraFileName,
  buildSearch,
  classifyImportText,
  findNode,
  mergeTopLevel,
  mergeWorkspaces,
  newerWorkspace,
  nodeFromState,
  nodeId,
  parseAddress,
  stateKey,
  readWorkspace,
  serializeWorkspace,
  stateFromNode,
  storageKey,
  TreeError,
  updateNode,
  workspaceFileName,
  workspaceFromStates,
  type Workspace,
  type WorkspaceNode,
} from "@/workspace";
import { createWorkspaceStorage, StorageProblem, storageWarning, type WorkspaceStorage } from "./storage";

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
  /** Something the player should know about the restore (e.g. an old link); null when all is well. */
  notice: string | null;
  /** Browser storage trouble (full, unavailable): the workspace still works, but isn't saved. Null when fine. */
  warning: string | null;
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
  warning: null,
};

export type LoadResult = { ok: true } | { ok: false; error: string };

/** A file's contents to save: name, text, and its media type. */
export interface ExportedFile {
  name: string;
  text: string;
  type: string;
}

/** A workspace file found among imported files while the workspace already has items: ask replace or merge. */
export interface PendingWorkspaceFile {
  name: string;
  text: string;
  /** Top-level items in the file. */
  count: number;
}

export interface ImportFilesResult {
  /** Ids of the top-level items added (from state codes, or workspace files applied directly). */
  added: string[];
  /** One message per file or code that couldn't be imported (the others still are). */
  errors: string[];
  /** Workspace files that need the player's choice: pass each to `importFile(text, "replace" | "merge")`. */
  pending: PendingWorkspaceFile[];
}

const SNAPSHOT_TIMEOUT_MS = 3000;

/** Header a page sends with its own pushes, so it can tell its own changes apart in the event stream. */
export const CLIENT_HEADER = "X-Aura-Client";

/** Where a change came from: the page itself (edits, paste, files, storage) or the server (a push). */
type Origin = "page" | "server";

/** The event stream's notice of a change (no code: auras can be megabytes, the page fetches them). */
interface ChangeNotice {
  revision: number;
  updatedAt: string | null;
  source: string | null;
}

interface ServerSnapshot extends ChangeNotice {
  code: string | null;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Storage writes still running, per key, so a new session (another addon version) reads after them. */
const writesInFlight = new Map<string, Promise<void>>();

/**
 * One page's connection to a workspace: restores it (the newer of browser storage and the server), keeps
 * storage and server in step with every change, and follows pushes over Server-Sent Events.
 *
 * - Address: only `?w=` (the workspace). An old `?code=` link is imported once; then the address is cleaned.
 * - Storage: IndexedDB (see `storage.ts`), written latest-wins so bursts of edits write once.
 * - Server: each top-level item a page change touched is sent as a push; a push from elsewhere arrives as a
 *   revision notice, is fetched, and merged into the top level (see `mergeTopLevel`).
 *
 * Create one per aura core; `dispose` stops it.
 */
export class WorkspaceSession {
  private view: WorkspaceView = EMPTY_VIEW;
  private disposed = false;
  private events: EventSource | null = null;
  /** Identifies this page's pushes in the event stream. */
  private readonly clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  /** The newest server revision this page has merged (its own pushes are skipped, not counted). */
  private revision = 0;
  private pulling = false;
  /** Revisions from other sources still to fetch, in order. */
  private readonly pullQueue: number[] = [];
  private pendingWrite: { id: string; workspace: Workspace } | null = null;
  private writing: Promise<void> | null = null;
  /** Encoded state code per node (nodes are immutable, so identity is a safe key). */
  private readonly codes = new WeakMap<WorkspaceNode, string>();
  /** Codes seen (decoded, stored, encoded) by content (`stateKey`): a re-encode would change the table order. */
  private readonly known = new Map<string, string>();

  constructor(
    private readonly core: AuraCore,
    private readonly onChange: (view: WorkspaceView) => void,
    private readonly storage: WorkspaceStorage = createWorkspaceStorage(),
  ) {}

  async start(fallbackCode: string): Promise<void> {
    const address = parseAddress(window.location.search);
    const id = address.workspaceId;
    const notices: string[] = [];
    if (address.legacyShortLink) {
      notices.push("Short links are no longer supported. Ask for the aura as a file (.txt) and import it, or paste its code.");
    }

    // Subscribe first: the server's snapshot is the remote candidate, and no push is missed after it.
    const remote = await this.follow(id);
    if (this.disposed) return;
    const local = await this.readStorage(id);
    if (this.disposed) return;

    let remoteWs: Workspace | null = null;
    if (remote) {
      try {
        remoteWs = workspaceFromStates([this.decode(remote.code)], remote.updatedAt);
      } catch {
        remoteWs = null;
      }
    }
    let items: WorkspaceNode[];
    let selected: string | null;
    let origin: Origin = "page";
    let updatedAt = new Date().toISOString();
    if (local && remoteWs && newerWorkspace(local, remoteWs) === remoteWs) {
      // A push arrived since this browser last saved: merge it like a live push.
      const merged = mergeTopLevel(local.items, remoteWs.items[0]);
      [items, selected, origin, updatedAt] = [merged.items, merged.id, "server", remoteWs.updatedAt];
    } else if (local ?? remoteWs) {
      const chosen = (local ?? remoteWs)!;
      [items, selected, updatedAt] = [chosen.items, chosen.selected ?? null, chosen.updatedAt];
      if (chosen === remoteWs) origin = "server";
    } else if (address.legacyCode) {
      [items, selected] = [[], null];
    } else {
      const ws = workspaceFromStates([this.decode(fallbackCode)]);
      [items, selected] = [ws.items, ws.selected ?? null];
    }

    // An old `?code=` link: import that aura once (like a push: it replaces the item with its uid or id).
    if (address.legacyCode) {
      try {
        const merged = mergeTopLevel(items, nodeFromState(this.decode(address.legacyCode)));
        [items, selected, origin, updatedAt] = [merged.items, merged.id, "page", new Date().toISOString()];
      } catch (e) {
        notices.push(`The link's state code doesn't load: ${errorText(e)}`);
      }
    }
    if (items.length === 0) {
      const ws = workspaceFromStates([this.decode(fallbackCode)]);
      [items, selected] = [ws.items, ws.selected ?? null];
    }
    this.commit(id, items, selected, origin, notices.join(" ") || null, updatedAt);
    this.cleanAddress(id);
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
    this.queueWrite(id, { items: this.view.items, updatedAt: new Date().toISOString(), selected: selectedId });
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

  /** The state code of any item (an aura, or a group with everything in it); the selected one by default. */
  codeOfItem(itemId: string | null = this.view.selectedId): string | null {
    const found = itemId ? findNode(this.view.items, itemId) : null;
    return found ? this.codeOf(found.node) : null;
  }

  /** An item's aura file: `<id>.txt` holding exactly its state code. */
  auraFile(itemId: string | null = this.view.selectedId): ExportedFile | null {
    const code = this.codeOfItem(itemId);
    if (!code || !itemId) return null;
    return { name: auraFileName(itemId), text: code, type: "text/plain;charset=utf-8" };
  }

  /** The workspace file (JSON) of the current workspace. */
  exportFile(): string {
    return serializeWorkspace(
      { items: this.view.items, updatedAt: new Date().toISOString(), selected: this.view.selectedId },
      { pretty: true, codeOf: this.codeOfNode },
    );
  }

  workspaceFile(): ExportedFile {
    return { name: workspaceFileName(this.view.workspaceId ?? "default"), text: this.exportFile(), type: "application/json" };
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

  /**
   * Imports files: every state code in a text file (one or several) is added to the top level; a workspace
   * file replaces an empty workspace, else it comes back in `pending` for the player to choose.
   */
  async importFiles(files: ArrayLike<File> | Iterable<File>): Promise<ImportFilesResult> {
    const result: ImportFilesResult = { added: [], errors: [], pending: [] };
    for (const file of Array.from(files)) {
      let text: string;
      try {
        text = await file.text();
      } catch (e) {
        result.errors.push(`Could not read ${file.name}: ${errorText(e)}`);
        continue;
      }
      if (this.disposed) return result;
      const content = classifyImportText(text);
      if (content.kind === "none") {
        result.errors.push(`Could not read ${file.name}: ${content.error}`);
      } else if (content.kind === "codes") {
        content.codes.forEach((code, i) => {
          const r = this.importCode(code);
          const where = content.codes.length > 1 ? `${file.name} (code ${i + 1})` : file.name;
          if (r.ok) result.added.push(this.view.selectedId!);
          else result.errors.push(`Could not read ${where}: ${r.error}`);
        });
      } else {
        const checked = this.checkFile(content.text);
        if (!checked.ok) result.errors.push(`Could not read ${file.name}: ${checked.error}`);
        else if (this.view.items.length === 0) {
          const r = this.importFile(content.text, "replace");
          if (r.ok) result.added.push(...this.view.items.map(nodeId));
          else result.errors.push(`Could not read ${file.name}: ${r.error}`);
        } else result.pending.push({ name: file.name, text: content.text, count: checked.items.length });
      }
    }
    return result;
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

  /** Makes `items` the workspace: view and storage follow, and (for page changes) the server. */
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
    this.queueWrite(id, { items, updatedAt, selected: this.view.selectedId });
    if (origin === "page") for (const code of topCodes) if (!before.has(code)) void this.pushToServer(id, code);
  }

  private setWarning(warning: string | null) {
    if (this.disposed || this.view.warning === warning) return;
    this.view = { ...this.view, warning };
    this.onChange(this.view);
  }

  private async readStorage(workspaceId: string): Promise<Workspace | null> {
    const key = storageKey(workspaceId);
    try {
      await writesInFlight.get(key);
      const result = readWorkspace(await this.storage.read(key), (c) => this.decode(c));
      if (!result.ok) return null;
      this.learn(result.codes);
      return result.workspace;
    } catch {
      return null;
    }
  }

  /** Saves the workspace; while a write runs, only the latest pending workspace is written next. */
  private queueWrite(id: string, workspace: Workspace) {
    this.pendingWrite = { id, workspace };
    if (this.writing) return;
    const key = storageKey(id);
    const drain = (async () => {
      while (this.pendingWrite) {
        const next = this.pendingWrite;
        this.pendingWrite = null;
        try {
          const text = serializeWorkspace(next.workspace, { codeOf: this.codeOfNode });
          await this.storage.write(storageKey(next.id), text);
          this.setWarning(null);
        } catch (e) {
          const problem = e instanceof StorageProblem ? e : new StorageProblem("failed", errorText(e));
          this.setWarning(storageWarning(problem));
        }
      }
    })();
    this.writing = drain;
    writesInFlight.set(key, drain);
    void drain.finally(() => {
      if (this.writing === drain) this.writing = null;
      if (writesInFlight.get(key) === drain) writesInFlight.delete(key);
    });
  }

  /** Leaves only `?w=` in the address (drops an old `code`/`s` and anything else of ours). */
  private cleanAddress(id: string) {
    if (this.disposed) return;
    const url = `${window.location.pathname}${buildSearch(id)}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", url);
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

  /** The server's snapshot: the latest, or a given recent revision (falls back to the latest when it's gone). */
  private async fetchSnapshot(id: string, revision?: number): Promise<ServerSnapshot | null> {
    try {
      const query = revision ? `?revision=${revision}` : "";
      let res = await fetch(`/api/workspaces/${encodeURIComponent(id)}${query}`, { cache: "no-store" });
      if (res.status === 404 && revision) res = await fetch(`/api/workspaces/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) return null;
      const body = (await res.json()) as Partial<ServerSnapshot>;
      return {
        code: typeof body.code === "string" ? body.code : null,
        revision: typeof body.revision === "number" ? body.revision : 0,
        updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
        source: typeof body.source === "string" ? body.source : null,
      };
    } catch {
      return null;
    }
  }

  /** Fetches and merges the announced revisions from elsewhere, one at a time and in order. */
  private async pull(id: string) {
    if (this.pulling) return;
    this.pulling = true;
    try {
      while (this.pullQueue.length && !this.disposed) {
        const wanted = this.pullQueue.shift()!;
        if (wanted <= this.revision) continue;
        const snap = await this.fetchSnapshot(id, wanted);
        if (!snap || this.disposed) continue;
        if (snap.code && snap.source !== this.clientId && snap.revision > this.revision) {
          this.adoptRemote(id, snap.code, snap.updatedAt ?? new Date().toISOString());
        }
        this.revision = Math.max(this.revision, snap.revision);
      }
    } finally {
      this.pulling = false;
    }
  }

  /**
   * Subscribes to the workspace's events and resolves with the server's current code (fetched after the first
   * snapshot notice), or null when it has none or doesn't answer in time. Later notices from other sources
   * are fetched and merged.
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
      const onNotice = (ev: Event) => {
        let notice: ChangeNotice;
        try {
          notice = JSON.parse((ev as MessageEvent<string>).data);
        } catch {
          return;
        }
        if (first) {
          first = false;
          clearTimeout(timer);
          if (!notice.revision) {
            resolve(null);
            return;
          }
          void this.fetchSnapshot(id).then((snap) => {
            if (snap) this.revision = Math.max(this.revision, snap.revision);
            resolve(snap?.code && snap.updatedAt ? { code: snap.code, updatedAt: snap.updatedAt } : null);
          });
          return;
        }
        if (!this.view.ready || notice.revision <= this.revision || notice.source === this.clientId) return;
        this.pullQueue.push(notice.revision);
        void this.pull(id);
      };
      events.addEventListener("snapshot", onNotice);
      events.addEventListener("state", onNotice);
    });
  }

  /** Tells the server (and so other pages and agents) about an item changed on this page. */
  private async pushToServer(id: string, code: string) {
    try {
      // `validate=false`: the page validates in the browser; the server only checks the code decodes.
      await fetch(`/api/workspaces/${encodeURIComponent(id)}/aura?validate=false`, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8", [CLIENT_HEADER]: this.clientId },
        body: code,
      });
    } catch {
      // Offline or no server: the page keeps working on its own.
    }
  }
}
