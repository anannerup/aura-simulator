/**
 * Browser storage for workspaces: IndexedDB, because auras can be megabytes and localStorage holds ~5 MB per
 * site. One record per game and workspace (key `storageKey(w)`, value the stored workspace JSON as a string). The
 * page uses it through `WorkspaceStore`, which writes behind. Where IndexedDB is missing (some private modes),
 * localStorage is used.
 *
 * Every call is guarded: reads answer null on any failure; writes throw a `StorageProblem` the page shows as a
 * non-blocking warning.
 */

import type { WorkspaceAddress } from "@/workspace";
import { idbStore, IdbUnavailable } from "@/lib/idb";
import { errorMessage } from "@/lib/errors";

// Its own database: "aura-simulator" belongs to the screenshot store (src/app/screen/screenshot-store.ts).
const DB_NAME = "aura-simulator-game-workspaces";
const STORE = "workspaces";
/** Where workspaces lived before they were per game; deleted, not migrated. */
const OLD_DB_NAME = "aura-simulator-workspaces";
const OLD_LOCAL_PREFIX = "aura-simulator:workspace:";

export type StorageProblemKind = "unavailable" | "quota" | "failed";

export class StorageProblem extends Error {
  constructor(
    readonly kind: StorageProblemKind,
    message: string,
  ) {
    super(message);
  }
}

export interface WorkspaceStorage {
  /** The stored text for a key, or null (nothing stored, or storage unreadable). */
  read(key: string): Promise<string | null>;
  /** Stores the text; throws `StorageProblem`. */
  write(key: string, text: string): Promise<void>;
}

export interface StorageEnv {
  indexedDB?: IDBFactory | null;
  localStorage?: Storage | null;
}

/** The page's own globals; touching them can throw (blocked site data), so each is guarded. */
function browserEnv(): StorageEnv {
  let indexedDB: IDBFactory | null = null;
  let localStorage: Storage | null = null;
  try {
    indexedDB = globalThis.indexedDB ?? null;
  } catch {
    indexedDB = null;
  }
  try {
    localStorage = globalThis.localStorage ?? null;
  } catch {
    localStorage = null;
  }
  return { indexedDB, localStorage };
}

function isQuotaError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const { name, code } = e as { name?: unknown; code?: unknown };
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014;
}

function problemOf(e: unknown): StorageProblem {
  if (e instanceof StorageProblem) return e;
  if (isQuotaError(e)) return new StorageProblem("quota", "Browser storage is full");
  const message = errorMessage(e);
  return new StorageProblem("failed", `Browser storage failed: ${message}`);
}

/** Deletes the workspaces stored before workspaces were per game (once per page; failures are ignored). */
export function deleteOldWorkspaces(env: StorageEnv) {
  try {
    env.indexedDB?.deleteDatabase(OLD_DB_NAME);
  } catch {}
  try {
    const local = env.localStorage;
    if (!local) return;
    const old: string[] = [];
    for (let i = 0; i < local.length; i++) {
      const key = local.key(i);
      if (key?.startsWith(OLD_LOCAL_PREFIX) || key === "aura-simulator:addon-ref") old.push(key);
    }
    for (const key of old) local.removeItem(key);
  } catch {}
}

export function createWorkspaceStorage(env: StorageEnv = browserEnv()): WorkspaceStorage {
  const local = env.localStorage ?? null;
  const idb = idbStore(() => env.indexedDB, DB_NAME, STORE);

  const readLocal = (key: string): string | null => {
    try {
      return local?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  return {
    async read(key) {
      let stored: unknown;
      try {
        stored = await idb.run("readonly", (s) => s.get(key));
      } catch {
        return readLocal(key);
      }
      return typeof stored === "string" ? stored : null;
    },

    async write(key, text) {
      try {
        await idb.run("readwrite", (s) => s.put(text, key));
        return;
      } catch (e) {
        if (!(e instanceof IdbUnavailable)) throw problemOf(e);
      }
      if (!local) throw new StorageProblem("unavailable", "Browser storage is unavailable (private mode or blocked site data)");
      try {
        local.setItem(key, text);
      } catch (e) {
        throw problemOf(e);
      }
    },
  };
}

/** What the page says when a write failed (non-blocking: the workspace keeps working in this tab). */
export function storageWarning(problem: StorageProblem): string {
  const advice = "Changes aren't saved in this browser; export the workspace as a file to keep them.";
  if (problem.kind === "quota") return `Browser storage is full. ${advice}`;
  if (problem.kind === "unavailable") return `Browser storage is unavailable (private mode or blocked site data). ${advice}`;
  return `${problem.message}. ${advice}`;
}

/** Browser-storage key of a game's workspace (the IndexedDB record key, or the localStorage key without IndexedDB). */
const storageKey = ({ game, id }: WorkspaceAddress) => `aura-simulator:${game}:workspace:${id}`;

/** Workspaces in browser storage by game and workspace ID, written behind so bursts of edits write once. */
export interface WorkspaceStore {
  /** The stored workspace text, read after any write to it still running; null when none or unreadable. */
  read(workspace: WorkspaceAddress): Promise<string | null>;
  /**
   * Saves `text()` soon. While a write runs, only the latest pending save is written next (`text` is called then, so
   * a skipped save costs nothing). `report` hears each outcome: null when saved, else a warning for the player.
   */
  save(workspace: WorkspaceAddress, text: () => string, report: (warning: string | null) => void): void;
}

export function createWorkspaceStore(storage: WorkspaceStorage = createWorkspaceStorage()): WorkspaceStore {
  type Save = { text: () => string; report: (warning: string | null) => void };
  const queues = new Map<string, { pending: Save | null; running: Promise<void> }>();
  return {
    async read(workspace) {
      await queues.get(storageKey(workspace))?.running;
      return storage.read(storageKey(workspace)).catch(() => null);
    },
    save(workspace, text, report) {
      const key = storageKey(workspace);
      const queued = queues.get(key);
      if (queued) {
        queued.pending = { text, report };
        return;
      }
      const queue: { pending: Save | null; running: Promise<void> } = { pending: { text, report }, running: Promise.resolve() };
      const drain = async () => {
        while (queue.pending) {
          const next = queue.pending;
          queue.pending = null;
          try {
            await storage.write(key, next.text());
            next.report(null);
          } catch (e) {
            next.report(storageWarning(problemOf(e)));
          }
        }
        queues.delete(key);
      };
      queues.set(key, queue);
      queue.running = drain();
    },
  };
}

let shared: WorkspaceStore | null = null;

/** The page's store, shared by every session (a new addon version reads after the old session's writes). */
export function pageWorkspaceStore(): WorkspaceStore {
  if (!shared) {
    deleteOldWorkspaces(browserEnv());
    shared = createWorkspaceStore();
  }
  return shared;
}
