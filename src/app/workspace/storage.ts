/**
 * Browser storage for workspaces: IndexedDB, because auras can be megabytes and localStorage holds ~5 MB per
 * site. One record per workspace (key `storageKey(id)`, value the stored workspace JSON as a string).
 *
 * Workspaces saved in localStorage by earlier versions move to IndexedDB the first time they are read (and are
 * then removed from localStorage). Where IndexedDB is missing (some private modes), localStorage is used.
 *
 * Every call is guarded: reads answer null on any failure; writes throw a `StorageProblem` the page shows as a
 * non-blocking warning.
 */

// Its own database: "aura-simulator" belongs to the screenshot store (src/app/screen/screenshot-store.ts).
const DB_NAME = "aura-simulator-workspaces";
const DB_VERSION = 1;
const STORE = "workspaces";

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
  const message = e instanceof Error ? e.message : String(e);
  return new StorageProblem("failed", `Browser storage failed: ${message}`);
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the database: let it, and reopen next time.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened"));
    request.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
  });
}

/** Runs one request in its own transaction; resolves when the transaction has committed. */
function run<T>(db: IDBDatabase, mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let request: IDBRequest<T>;
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, mode);
      request = body(tx.objectStore(STORE));
    } catch (e) {
      reject(e);
      return;
    }
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? request.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function createWorkspaceStorage(env: StorageEnv = browserEnv()): WorkspaceStorage {
  const local = env.localStorage ?? null;
  let db: Promise<IDBDatabase | null> | null = null;
  const database = (): Promise<IDBDatabase | null> => {
    if (!env.indexedDB) return Promise.resolve(null);
    db ??= openDb(env.indexedDB).catch(() => {
      db = null; // retry on the next call
      return null;
    });
    return db;
  };

  const readLocal = (key: string): string | null => {
    try {
      return local?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  return {
    async read(key) {
      const idb = await database();
      if (!idb) return readLocal(key);
      let stored: unknown;
      try {
        stored = await run(idb, "readonly", (s) => s.get(key));
      } catch {
        return readLocal(key);
      }
      if (typeof stored === "string") return stored;
      // Not in IndexedDB yet: move a localStorage copy over, once.
      const legacy = readLocal(key);
      if (legacy === null) return null;
      try {
        await run(idb, "readwrite", (s) => s.put(legacy, key));
        local?.removeItem(key);
      } catch {
        // Keep the localStorage copy; the next write retries IndexedDB.
      }
      return legacy;
    },

    async write(key, text) {
      const idb = await database();
      if (idb) {
        try {
          await run(idb, "readwrite", (s) => s.put(text, key));
          return;
        } catch (e) {
          throw problemOf(e);
        }
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
