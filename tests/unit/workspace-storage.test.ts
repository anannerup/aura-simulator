import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createWorkspaceStorage, createWorkspaceStore, StorageProblem, storageWarning } from "@/client/workspace/storage";

/** A Map-backed localStorage; `quota` makes setItem throw like a full browser storage. */
function memoryStorage(entries: Record<string, string> = {}, quota = Infinity): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => {
      if (v.length > quota) throw new DOMException("full", "QuotaExceededError");
      map.set(k, String(v));
    },
  };
}

const KEY = "aura-simulator:workspace:w1";

describe("workspace storage", () => {
  it("keeps multi-megabyte workspaces in IndexedDB", async () => {
    const indexedDB = new IDBFactory();
    const big = JSON.stringify({ payload: "x".repeat(6 * 1024 * 1024) });
    await createWorkspaceStorage({ indexedDB, localStorage: memoryStorage({}, 5_000_000) }).write(KEY, big);
    // A new page (new storage object) reads it back.
    expect(await createWorkspaceStorage({ indexedDB, localStorage: null }).read(KEY)).toBe(big);
    expect(await createWorkspaceStorage({ indexedDB, localStorage: null }).read("other")).toBeNull();
  });

  it("moves a workspace saved in localStorage to IndexedDB once", async () => {
    const indexedDB = new IDBFactory();
    const local = memoryStorage({ [KEY]: '{"old": true}', unrelated: "stays" });
    const storage = createWorkspaceStorage({ indexedDB, localStorage: local });
    expect(await storage.read(KEY)).toBe('{"old": true}');
    expect(local.getItem(KEY)).toBeNull();
    expect(local.getItem("unrelated")).toBe("stays");
    // From now on IndexedDB answers, and a stale localStorage copy can't win.
    local.setItem(KEY, '{"stale": true}');
    expect(await createWorkspaceStorage({ indexedDB, localStorage: local }).read(KEY)).toBe('{"old": true}');
  });

  it("falls back to localStorage without IndexedDB, and reports a full storage as a quota problem", async () => {
    const local = memoryStorage({}, 10);
    const storage = createWorkspaceStorage({ indexedDB: null, localStorage: local });
    await storage.write(KEY, "small");
    expect(await storage.read(KEY)).toBe("small");
    const error = await storage.write(KEY, "far too long for this").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageProblem);
    expect((error as StorageProblem).kind).toBe("quota");
    expect(storageWarning(error as StorageProblem)).toMatch(/full.*export/i);
  });

  it("never throws on reads, and says when there is no storage at all", async () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;
    expect(await createWorkspaceStorage({ indexedDB: null, localStorage: throwing }).read(KEY)).toBeNull();
    const broken = { open: () => { throw new Error("blocked"); } } as unknown as IDBFactory;
    expect(await createWorkspaceStorage({ indexedDB: broken, localStorage: null }).read(KEY)).toBeNull();
    const error = await createWorkspaceStorage({ indexedDB: null, localStorage: null }).write(KEY, "x").catch((e: unknown) => e);
    expect((error as StorageProblem).kind).toBe("unavailable");
  });
});

describe("workspace store (written behind)", () => {
  it("writes a burst of saves once (the latest), and a read waits for it", async () => {
    const local = memoryStorage();
    const store = createWorkspaceStore(createWorkspaceStorage({ indexedDB: null, localStorage: local }));
    const serialized: string[] = [];
    const save = (text: string) => store.save("w1", () => (serialized.push(text), text), () => {});
    save("first");
    save("second");
    save("third");
    expect(await store.read("w1")).toBe("third");
    expect(serialized).toEqual(["first", "third"]); // "second" was replaced before its turn and never serialized
    expect(local.getItem(KEY)).toBe("third");
  });

  it("reports a failed write as a warning, and the next good write clears it", async () => {
    const store = createWorkspaceStore(createWorkspaceStorage({ indexedDB: null, localStorage: memoryStorage({}, 10) }));
    const heard: (string | null)[] = [];
    store.save("w1", () => "far too long for this", (w) => heard.push(w));
    await store.read("w1");
    store.save("w1", () => "small", (w) => heard.push(w));
    await store.read("w1");
    expect(heard).toEqual([expect.stringMatching(/full/), null]);
  });
});
