import type { AuraCore, AuraDocument, AuraState, OptionDialog, OptionNode } from "@/core";

/** Many changes in a row (slider drag) wait this long for the last one. */
const CONTINUOUS_DELAY_MS = 50;

export const optionId = (path: string[]) => path.join("\u001f");
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface Draft {
  value: unknown;
  /** The edit has gone through the VM; dropped when the next option tree arrives. */
  done: boolean;
}

export interface OptionEditsView {
  /** What fields show until the rebuilt tree arrives, by `optionId`. */
  drafts: Record<string, Draft>;
  /** Per-field errors, by `optionId`. */
  errors: Record<string, string>;
  /** Edits on their way through the addon VM (tests and tools wait for 0). */
  pending: number;
  /** A dialog one of the addon's buttons opened (icon picker, code editor, confirmation, …). */
  dialog: { tab: string; node: OptionNode; dialog: OptionDialog } | null;
  /** Bumped when the shown tree must be rebuilt because the document did not change as the field shows. */
  rebuilds: number;
}

export interface OptionEditsDeps {
  setOption: AuraCore["setOption"];
  /** The page takes the edited aura (and a group's changed descendants); `ok: false` rolls the edit back. */
  onChange(doc: AuraDocument, children?: AuraDocument[]): { ok: boolean; error?: string } | void;
}

/**
 * The options editor's edits, outside React: one queue through the addon VM (each edit applies to the result of the
 * one before), drafts so fields show the typed value at once, debounced continuous edits, multiselect edits as
 * [key, checked] pairs, and rollback when the page refuses a change. Subscribe with `useSyncExternalStore`.
 */
export class OptionEdits {
  private deps: OptionEditsDeps;
  private document: AuraState;
  private view: OptionEditsView = { drafts: {}, errors: {}, pending: 0, dialog: null, rebuilds: 0 };
  private queue: Promise<void> = Promise.resolve();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<() => void>();

  constructor(deps: OptionEditsDeps, document: AuraState) {
    this.deps = deps;
    this.document = document;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getView = () => this.view;

  /** The latest core and page callback (they change between renders). */
  connect(deps: OptionEditsDeps) {
    this.deps = deps;
  }

  /** The page's current document; queued edits apply to the newer of it and their own results. */
  setDocument(document: AuraState) {
    this.document = document;
  }

  /** A rebuilt option tree arrived: drafts of finished edits give way to the tree's values. */
  treeBuilt() {
    const kept = Object.entries(this.view.drafts).filter(([, d]) => !d.done);
    if (kept.length !== Object.keys(this.view.drafts).length) this.update({ drafts: Object.fromEntries(kept) });
  }

  /** A field's change: shown at once as a draft, applied now or (continuous) after the last of a run. */
  edit(tab: string, node: OptionNode, value: unknown, options?: { continuous?: boolean }) {
    const id = optionId(node.path);
    if (node.type === "multiselect") {
      const [key, checked] = value as [unknown, boolean];
      const base = (this.view.drafts[id]?.value ?? node.value) as [unknown, boolean][] | undefined;
      const list = (Array.isArray(base) ? base : []).map(([k, v]): [unknown, boolean] => [k, k === key ? checked : v]);
      this.setDraft(id, list);
    } else if (node.type !== "execute") this.setDraft(id, value);
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    if (!options?.continuous) return this.commit(tab, node, value);
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this.commit(tab, node, value);
      }, CONTINUOUS_DELAY_MS),
    );
  }

  /** Answers the open dialog through the button that opened it. */
  chooseInDialog(value: unknown) {
    const open = this.view.dialog;
    if (!open) return;
    this.update({ dialog: null });
    this.commit(open.tab, open.node, value);
  }

  closeDialog() {
    this.update({ dialog: null });
  }

  dispose() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }

  private commit(tab: string, node: OptionNode, value: unknown) {
    const id = optionId(node.path);
    this.update({ pending: this.view.pending + 1 });
    this.queue = this.queue.then(async () => {
      try {
        const edit = await this.deps.setOption(this.document, { tab, path: node.path }, value);
        if (edit.dialog) this.update({ dialog: { tab, node, dialog: edit.dialog } });
        if (!edit.changed) return this.fail(id, null);
        const previous = this.document;
        this.document = { aura: edit.aura, children: edit.children ?? previous.children };
        const r = this.deps.onChange(edit.aura, edit.children);
        if (r && !r.ok) {
          this.document = previous;
          this.fail(id, r.error ?? "The page could not take this change");
        } else {
          this.setError(id, edit.warning ? `The addon reported an error during this change: ${edit.warning}` : null);
        }
      } catch (e) {
        this.fail(id, message(e));
      } finally {
        const d = this.view.drafts[id];
        const finished = d && (node.type === "multiselect" || d.value === value);
        this.update({
          pending: this.view.pending - 1,
          ...(finished && { drafts: { ...this.view.drafts, [id]: { value: d.value, done: true } } }),
        });
      }
    });
  }

  /** The document did not change as the field shows: show the error (or none) and rebuild the tree. */
  private fail(id: string, error: string | null) {
    this.setError(id, error);
    this.update({ rebuilds: this.view.rebuilds + 1 });
  }

  private setDraft(id: string, value: unknown) {
    this.update({ drafts: { ...this.view.drafts, [id]: { value, done: false } } });
  }

  private setError(id: string, error: string | null) {
    const errors = this.view.errors;
    if (error === null) {
      if (!(id in errors)) return;
      const next = { ...errors };
      delete next[id];
      this.update({ errors: next });
    } else this.update({ errors: { ...errors, [id]: error } });
  }

  private update(patch: Partial<OptionEditsView>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((l) => l());
  }
}
