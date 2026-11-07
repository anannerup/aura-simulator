import { errorMessage } from "./errors";
/** IndexedDB could not be opened (missing, blocked site data, private mode, another tab blocking an upgrade). */
export class IdbUnavailable extends Error {}

export interface IdbStore {
  /**
   * Runs one request in its own transaction and resolves with its result once the transaction has committed.
   * Rejects with `IdbUnavailable` when the database can't be opened, or with the transaction's error.
   */
  run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T>;
}

/**
 * One object store in a database of its own (version 1, created on first open). The connection is opened on first
 * use and kept; it is reopened after a failed open or when another tab upgrades the database. `factory` is read
 * lazily because touching `indexedDB` can throw.
 */
export function idbStore(factory: () => IDBFactory | null | undefined, database: string, store: string): IdbStore {
  let db: Promise<IDBDatabase> | null = null;
  const connect = () => {
    db ??= open(factory, database, store, () => (db = null)).catch((e: unknown) => {
      db = null;
      throw new IdbUnavailable(errorMessage(e));
    });
    return db;
  };
  return {
    async run(mode, body) {
      const conn = await connect();
      return new Promise((resolve, reject) => {
        let request: IDBRequest;
        let tx: IDBTransaction;
        try {
          tx = conn.transaction(store, mode);
          request = body(tx.objectStore(store));
        } catch (e) {
          reject(e);
          return;
        }
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error ?? request.error ?? new Error("IndexedDB transaction failed"));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      });
    },
  };
}

function open(factory: () => IDBFactory | null | undefined, database: string, store: string, onClosed: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      const idb = factory();
      if (!idb) throw new Error("IndexedDB is not available");
      request = idb.open(database, 1);
    } catch (e) {
      reject(e);
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
    };
    request.onsuccess = () => {
      const conn = request.result;
      // Another tab upgrading the database: let it, and reopen next time.
      conn.onversionchange = () => {
        conn.close();
        onClosed();
      };
      resolve(conn);
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened"));
    request.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
  });
}
