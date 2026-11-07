import {
  canonicalize,
  fromWagoJson,
  isStateCode,
  sampleIconAura,
  toWagoJson,
  type AuraCore,
  type AuraDocument,
  type AuraState,
  type DecodedState,
  type LuaObject,
} from "@/core";
import {
  addSubtree,
  auraFileName,
  chooseRestore,
  classifyImportText,
  findNode,
  mergeTopLevel,
  mergeWorkspaces,
  nodeFromState,
  nodeId,
  parseWagoLink,
  parseWorkspaceId,
  placeNewAura,
  readWorkspace,
  replaceNode,
  serializeWorkspace,
  stateFromNode,
  updateNode,
  updateWithDescendants,
  wagoRouteUrl,
  workspaceFileName,
  type PushInput,
  type Workspace,
  type WorkspaceAddress,
  type WorkspaceNode,
} from "@/workspace";
import { StateCodes } from "./codes";
import { ServerLink } from "./server-link";
import { pageWorkspaceStore, type WorkspaceStore } from "./storage";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";

/** What the page shows of the workspace. */
export interface WorkspaceView {
  /** The workspace the page follows (from `?w=`, else "default"); null until restored. */
  workspaceId: string | null;
  /** Every top-level aura; empty until restored. */
  items: WorkspaceNode[];
  /** The selected aura's id. */
  selectedId: string | null;
  /** The selected aura's state code (a group's includes its descendants). */
  code: string | null;
  /** The selected aura's document. */
  aura: AuraDocument | null;
  /** The selected group's descendants, flattened as in its state code. */
  children: AuraDocument[];
  /** True once restored. */
  ready: boolean;
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
  warning: null,
};

/** The outcome of an edit; on failure nothing changed. */
export type EditResult = { ok: true } | { ok: false; error: string };

export const NOT_READY = { ok: false, error: "The workspace is still loading" } as const;

/** A file's contents to save: name, text, and its media type. */
export interface ExportedFile {
  name: string;
  text: string;
  type: string;
}

/** A workspace file found among imported files while the workspace already has items: replace or merge? */
export interface PendingWorkspaceFile {
  name: string;
  workspace: Workspace;
}

export interface ImportFilesResult {
  /** Ids of the top-level auras added (from state codes, or a workspace file applied directly). */
  added: string[];
  /** One message per file or code that couldn't be imported (the others still are). */
  errors: string[];
  /** Workspace files that need the player's choice: pass each to `applyWorkspaceFile`. */
  pending: PendingWorkspaceFile[];
}

export interface SessionDeps {
  store?: WorkspaceStore;
  link?: (workspace: WorkspaceAddress) => ServerLink;
  /** A wago aura's import string by its id; default: the game's server route (`wagoRouteUrl`). */
  wagoCode?: (id: string) => Promise<string>;
}

const now = () => new Date().toISOString();

/**
 * One page's workspace of a game for one aura core: restores it (browser storage, or the server's newer push), applies every
 * edit, keeps browser storage and the server in step, and follows pushes. Subscribe for the `WorkspaceView`.
 *
 * Every top-level aura a page change touched is sent to the server as a push, so agents can read the page's current
 * aura there; pushes from elsewhere are merged into the top level (`mergeTopLevel`). A new core (another addon
 * version) gets a new session, which restores the same workspace from browser storage.
 */
export class WorkspaceSession {
  private view: WorkspaceView = EMPTY_VIEW;
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  private link: ServerLink | null = null;
  private readonly codes: StateCodes;
  private readonly store: WorkspaceStore;
  private readonly makeLink: (workspace: WorkspaceAddress) => ServerLink;
  private readonly wagoCode: (id: string) => Promise<string>;

  constructor(
    private readonly core: AuraCore,
    /** The game the workspace belongs to: storage, the server and workspace files are per game. */
    private readonly game: string,
    deps: SessionDeps = {},
  ) {
    this.codes = new StateCodes(core);
    this.store = deps.store ?? pageWorkspaceStore();
    this.makeLink = deps.link ?? ((w) => new ServerLink(w));
    this.wagoCode =
      deps.wagoCode ?? (async (id) => (await fetchJson<{ code: string }>(wagoRouteUrl(game, id))).code);
  }

  readonly getView = () => this.view;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  /** Restores the workspace the address (`?w=`) names. */
  async start(search: string): Promise<void> {
    const id = parseWorkspaceId(search);
    const link = (this.link = this.makeLink({ game: this.game, id }));
    // Ask the server first: no push is missed after its answer.
    const latest = await link.latest();
    if (this.disposed) return;
    const stored = readWorkspace(await this.store.read({ game: this.game, id }), this.game);
    if (this.disposed) return;
    if (stored.ok) this.codes.learn(stored.codes);
    const pushedNode = latest && this.tryNode(latest.code);
    const restored = chooseRestore({
      stored: stored.ok ? stored.workspace : null,
      pushed: pushedNode ? { node: pushedNode, updatedAt: latest!.updatedAt } : null,
      fallback: () => ({ aura: sampleIconAura(this.core.internalVersion) }),
      now: now(),
    });
    this.commit(id, restored.items, restored.selected, restored.fromServer ? "server" : "page", restored.updatedAt);
    link.follow((push) => this.adopt(push.code, push.updatedAt));
  }

  /** Opens a state code as the whole workspace. */
  openCode(code: string): EditResult {
    return this.withCode(code, (node) => ({ items: [node], id: nodeId(node) }));
  }

  /** Adds a state code (an aura, or a group with its subtree) to the top level and selects it. */
  addCode(code: string): { ok: true; id: string } | { ok: false; error: string } {
    return this.withCode(code, (node) => addSubtree(this.view.items, node, { parentId: null }));
  }

  /**
   * Imports what the player pasted into Import: a state code, wago JSON, or a wago link or id (its import string is
   * fetched through the server). "load" opens it as the whole workspace, "add" puts it beside what's there.
   */
  async importText(text: string, action: "load" | "add"): Promise<EditResult> {
    const trimmed = text.trim();
    if (!trimmed) return { ok: false, error: "Paste an import string, wago JSON or a wago link first" };
    let code = trimmed;
    if (trimmed.startsWith("{")) {
      try {
        code = this.core.encode(fromWagoJson(trimmed));
      } catch (e) {
        return { ok: false, error: errorMessage(e) };
      }
    } else if (!isStateCode(trimmed)) {
      const link = parseWagoLink(trimmed, { bareId: true });
      if (link && !link.ok) return { ok: false, error: link.error };
      if (link) {
        try {
          code = await this.wagoCode(link.id);
        } catch (e) {
          return { ok: false, error: `Could not fetch ${link.id} from wago.io: ${errorMessage(e)}` };
        }
        if (this.disposed) return { ok: false, error: "The page changed while fetching" };
      }
    }
    const result = action === "load" ? this.openCode(code) : this.addCode(code);
    return result.ok ? { ok: true } : result;
  }

  /**
   * Loads an aura the way a push does (`window.auraSimulator.load`): replaces the top-level aura with its uid (else
   * id), or adds it; selects it. Returns its id and state code.
   */
  load(input: PushInput): { ok: true; id: string; code: string } | { ok: false; error: string } {
    const id = this.view.workspaceId;
    if (!id) return NOT_READY;
    try {
      if ("wagoId" in input) throw new Error("A wago link needs the server: push it over HTTP, or paste it into Import");
      const node =
        "code" in input
          ? nodeFromState(this.codes.decode(input.code))
          : "wagoJson" in input
            ? nodeFromState(this.fromWagoJson(input.wagoJson))
            : nodeFromState({ aura: canonicalize(input.aura) as AuraDocument, children: input.children.map((c) => canonicalize(c) as AuraDocument) });
      const merged = mergeTopLevel(this.view.items, node);
      this.commit(id, merged.items, merged.id, "page");
      return { ok: true, id: merged.id, code: this.codeOf(merged.id)! };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  }

  /** Replaces the tree (an edit from the tree UI, or undo) and the selection. */
  setItems(items: WorkspaceNode[], selectedId: string | null): EditResult {
    const id = this.view.workspaceId;
    if (!id) return NOT_READY;
    return this.attempt(() => this.commit(id, items, selectedId, "page"));
  }

  select(selectedId: string) {
    const id = this.view.workspaceId;
    if (!id || selectedId === this.view.selectedId || !findNode(this.view.items, selectedId)) return;
    this.show(this.withSelection(this.view, this.view.items, selectedId));
    this.save(id, now());
  }

  /**
   * Replaces the selected aura's document (editors, spell picker); a changed `id` renames it. A group's tabs edit
   * its descendants too: pass them as `descendants`.
   */
  updateSelected(doc: AuraDocument, descendants?: AuraDocument[]): EditResult {
    const id = this.view.workspaceId;
    const selected = this.view.selectedId;
    if (!id || !selected) return { ok: false, error: "Nothing is selected" };
    return this.attempt(() => {
      const updated = descendants
        ? updateWithDescendants(this.view.items, selected, doc, descendants)
        : updateNode(this.view.items, selected, doc);
      this.commit(id, updated.items, updated.id, "page");
    });
  }

  /**
   * The selected aura (a group with everything in it) as wago JSON, the form wago.io's Editor shows. Throws
   * WagoJsonError when wago can't hold the aura (a boolean key). Null when nothing is selected.
   */
  wagoJson(auraId: string | null = this.view.selectedId): string | null {
    const code = this.codeOf(auraId);
    return code ? toWagoJson(this.core.decode(code)) : null;
  }

  /**
   * Replaces the selected aura (a group with its whole subtree) with edited wago JSON, read by wago's rules
   * (`fromWagoJson`) and checked by the addon's own import as a pasted code would be. Returns the aura's wago JSON
   * as it now is.
   */
  applyWagoJson(text: string): { ok: true; json: string } | { ok: false; error: string } {
    const id = this.view.workspaceId;
    const selected = this.view.selectedId;
    if (!id || !selected) return { ok: false, error: "Nothing is selected" };
    try {
      const updated = replaceNode(this.view.items, selected, nodeFromState(this.fromWagoJson(text)));
      this.commit(id, updated.items, updated.id, "page");
      return { ok: true, json: this.wagoJson(updated.id)! };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  }

  /** Makes a new aura with the addon's own New Aura (`WeakAuras.NewAura`) and places it where the game would. */
  async createAura(regionType: string, sourceData?: LuaObject): Promise<EditResult> {
    try {
      const made = await this.core.newAura(regionType, sourceData);
      const id = this.view.workspaceId;
      if (!id) return NOT_READY;
      const placed = placeNewAura(this.view.items, this.view.selectedId, made);
      return this.attempt(() => this.commit(id, placed.items, placed.id, "page"));
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  }

  /** The state code of an aura (an aura, or a group with everything in it); the selected one by default. */
  codeOf(auraId: string | null = this.view.selectedId): string | null {
    const found = auraId ? findNode(this.view.items, auraId) : null;
    return found ? this.codes.of(found.node) : null;
  }

  /** An aura's document and (for a group) its descendants, as a push takes them; the selected one by default. */
  stateOf(auraId: string | null = this.view.selectedId): AuraState | null {
    const found = auraId ? findNode(this.view.items, auraId) : null;
    return found ? stateFromNode(found.node) : null;
  }

  /** An aura's aura file: `<id>.txt` holding exactly its state code; the selected one by default. */
  auraFile(auraId: string | null = this.view.selectedId): ExportedFile | null {
    const code = this.codeOf(auraId);
    if (!code || !auraId) return null;
    return { name: auraFileName(auraId), text: code, type: "text/plain;charset=utf-8" };
  }

  /**
   * An aura's wago JSON file: `<id>.json` holding what wago.io's Editor shows for its state code; the selected one
   * by default. Throws WagoJsonError when wago can't hold the aura (a boolean key).
   */
  auraJsonFile(auraId: string | null = this.view.selectedId): ExportedFile | null {
    const code = this.codeOf(auraId);
    if (!code || !auraId) return null;
    const name = auraFileName(auraId).replace(/\.txt$/, ".json");
    return { name, text: toWagoJson(this.core.decode(code)), type: "application/json" };
  }

  /** The workspace file (`.aura-workspace.json`, see `workspace.ts`). */
  workspaceFile(): ExportedFile {
    const text = serializeWorkspace(
      { items: this.view.items, updatedAt: now(), selected: this.view.selectedId },
      { game: this.game, pretty: true, codeOf: (n) => this.codes.of(n) },
    );
    return { name: workspaceFileName(this.game, this.view.workspaceId ?? "default"), text, type: "application/json" };
  }

  /**
   * Imports files: every state code in a text file (one or several) is added to the top level; a workspace file
   * replaces an empty workspace, else it comes back in `pending` for the player to choose.
   */
  async importFiles(files: Iterable<File>): Promise<ImportFilesResult> {
    const result: ImportFilesResult = { added: [], errors: [], pending: [] };
    for (const file of files) {
      const fail = (error: string) => result.errors.push(`Could not read ${file.name}: ${error}`);
      let text: string;
      try {
        text = await file.text();
      } catch (e) {
        fail(errorMessage(e));
        continue;
      }
      if (this.disposed) return result;
      const content = classifyImportText(text);
      if (content.kind === "none") {
        fail(content.error);
      } else if (content.kind === "wago-json") {
        const r = this.withState(() => this.fromWagoJson(content.text), (node) => addSubtree(this.view.items, node, { parentId: null }));
        if (r.ok) result.added.push(r.id);
        else fail(r.error);
      } else if (content.kind === "codes") {
        content.codes.forEach((code, i) => {
          const r = this.addCode(code);
          if (r.ok) result.added.push(r.id);
          else result.errors.push(`Could not read ${content.codes.length > 1 ? `${file.name} (code ${i + 1})` : file.name}: ${r.error}`);
        });
      } else {
        const read = readWorkspace(content.text, this.game);
        if (!read.ok) {
          fail(read.error);
          continue;
        }
        this.codes.learn(read.codes);
        const pending = { name: file.name, workspace: read.workspace };
        if (this.view.items.length > 0) result.pending.push(pending);
        else {
          const r = this.applyWorkspaceFile(pending, "replace");
          if (r.ok) result.added.push(...this.view.items.map(nodeId));
          else fail(r.error);
        }
      }
    }
    return result;
  }

  /** Applies a workspace file: replaces the workspace, or adds its items. */
  applyWorkspaceFile(file: PendingWorkspaceFile, mode: "replace" | "merge"): EditResult {
    const id = this.view.workspaceId;
    if (!id) return NOT_READY;
    const { items, selected } = file.workspace;
    return this.attempt(() => {
      if (mode === "replace") return this.commit(id, items, selected ?? null, "page");
      const before = this.view.items.length;
      const merged = mergeWorkspaces(this.view.items, items);
      this.commit(id, merged, merged[before] ? nodeId(merged[before]) : this.view.selectedId, "page");
    });
  }

  dispose() {
    this.disposed = true;
    this.link?.dispose();
    this.listeners.clear();
  }

  private attempt(edit: () => void): EditResult {
    try {
      edit();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  }

  private withCode<R extends { items: WorkspaceNode[]; id: string }>(
    code: string,
    apply: (node: WorkspaceNode) => R,
  ): { ok: true; id: string } | { ok: false; error: string } {
    const trimmed = code.trim();
    if (!trimmed) return { ok: false, error: "Paste a state code first" };
    return this.withState(() => this.codes.decode(trimmed), apply);
  }

  private withState<R extends { items: WorkspaceNode[]; id: string }>(
    read: () => AuraState,
    apply: (node: WorkspaceNode) => R,
  ): { ok: true; id: string } | { ok: false; error: string } {
    const id = this.view.workspaceId;
    if (!id) return NOT_READY;
    try {
      const next = apply(nodeFromState(read()));
      this.commit(id, next.items, next.id, "page");
      return { ok: true, id: next.id };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  }

  /**
   * wago JSON as the aura wago would give: rebuilt by wago's rules, then encoded and decoded by the addon, so the
   * addon's own import checks it as it checks a pasted code (and the code is remembered for its content).
   */
  private fromWagoJson(text: string): DecodedState {
    return this.codes.decode(this.core.encode(fromWagoJson(text)));
  }

  private tryNode(code: string): WorkspaceNode | null {
    try {
      return nodeFromState(this.codes.decode(code));
    } catch {
      return null; // e.g. pushed for another addon version
    }
  }

  private withSelection(view: WorkspaceView, items: WorkspaceNode[], selectedId: string | null): WorkspaceView {
    const found = selectedId ? findNode(items, selectedId) : null;
    const node = found?.node ?? items[0] ?? null;
    if (!node) return { ...view, items, selectedId: null, code: null, aura: null, children: [] };
    const { children } = stateFromNode(node);
    return { ...view, items, selectedId: nodeId(node), code: this.codes.of(node), aura: node.aura, children };
  }

  private show(view: WorkspaceView) {
    this.view = view;
    for (const listener of this.listeners) listener();
  }

  /** Makes `items` the workspace: the view and storage follow, and (for page changes) the server. */
  private commit(
    id: string,
    items: WorkspaceNode[],
    selectedId: string | null,
    origin: "page" | "server",
    updatedAt = now(),
  ) {
    if (this.disposed) return;
    const before = new Set(this.view.items.map((n) => this.codes.of(n)));
    const topCodes = items.map((n) => this.codes.of(n)); // throws (and changes nothing) if the addon can't encode it
    this.show(this.withSelection({ ...this.view, workspaceId: id, ready: true }, items, selectedId));
    this.save(id, updatedAt);
    if (origin === "page") for (const code of topCodes) if (!before.has(code)) void this.link?.push(code);
  }

  private save(id: string, updatedAt: string) {
    const { items, selectedId } = this.view;
    this.store.save(
      { game: this.game, id },
      () => serializeWorkspace({ items, updatedAt, selected: selectedId }, { game: this.game, codeOf: (n) => this.codes.of(n) }),
      (warning) => {
        if (!this.disposed && this.view.warning !== warning) this.show({ ...this.view, warning });
      },
    );
  }

  /** A push from elsewhere: merged into the top level and selected. */
  private adopt(code: string, updatedAt: string) {
    if (!this.view.workspaceId || this.view.items.some((n) => this.codes.of(n) === code)) return;
    const node = this.tryNode(code);
    if (!node) return;
    try {
      const merged = mergeTopLevel(this.view.items, node);
      this.commit(this.view.workspaceId, merged.items, merged.id, "server", updatedAt);
    } catch {
      // Not encodable here: ignore.
    }
  }
}
