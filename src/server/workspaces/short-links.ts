import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Stores state codes too long for an address under a short ID. */
export interface ShortLinkStore {
  /** Stores a code and returns its ID. The same code always gets the same ID. */
  put(code: string): string;
  /** The stored code, or null for an unknown ID. */
  get(id: string): string | null;
  close(): void;
}

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MIN_ID_LENGTH = 8;

/** Base62 of the code's SHA-256: deterministic, so storing a code twice gives one row. */
function hashId(code: string): string {
  let n = BigInt(`0x${createHash("sha256").update(code).digest("hex")}`);
  let out = "";
  while (out.length < 32) {
    out += ALPHABET[Number(n % BigInt(62))];
    n /= BigInt(62);
  }
  return out;
}

export function createShortLinkStore(options: { dbPath: string }): ShortLinkStore {
  if (options.dbPath !== ":memory:") mkdirSync(path.dirname(options.dbPath), { recursive: true });
  const db = new DatabaseSync(options.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`CREATE TABLE IF NOT EXISTS short_links (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  const select = db.prepare("SELECT code FROM short_links WHERE id = ?");
  const insert = db.prepare("INSERT INTO short_links (id, code, created_at) VALUES (?, ?, ?)");

  return {
    put(code) {
      const full = hashId(code);
      // Lengthen the ID only on the (astronomically rare) collision with a different code.
      for (let len = MIN_ID_LENGTH; len <= full.length; len++) {
        const id = full.slice(0, len);
        const row = select.get(id) as { code: string } | undefined;
        if (!row) {
          insert.run(id, code, new Date().toISOString());
          return id;
        }
        if (row.code === code) return id;
      }
      throw new Error("Could not find a free short-link ID");
    },
    get(id) {
      const row = select.get(id) as { code: string } | undefined;
      return row?.code ?? null;
    },
    close() {
      db.close();
    },
  };
}
