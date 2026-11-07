/**
 * Files the player imports and exports. Auras can be megabytes, so files (not the address) carry them:
 *
 * - An **aura file** (`<aura name>.txt`): exactly one state code (`!WA:2!...`), UTF-8, nothing else, so the
 *   player can open it and paste it into the game's import dialog.
 * - A **wago JSON file** (`<aura name>.json`): the aura (or group) as wago.io's JSON (`toWagoJson`).
 * - A **workspace file** (`.aura-workspace.json`): the whole workspace of one game (see `workspace.ts`).
 *
 * Importing accepts any of them: any text holding one or more state codes (several, e.g. one per line), wago JSON,
 * or a workspace file. Pure; the page reads the files and the session applies them.
 */
import { findStateCodes } from "@/core";
import { WORKSPACE_FORMAT } from "./workspace";

export type ImportText =
  /** A workspace file: hand the text to `readWorkspace` (the page asks whether to replace or merge). */
  | { kind: "workspace"; text: string }
  /** wago JSON of one aura or group (unchecked: `fromWagoJson` reads it). */
  | { kind: "wago-json"; text: string }
  /** State codes found in the text, in order (unchecked: decode them before trusting them). */
  | { kind: "codes"; codes: string[] }
  | { kind: "none"; error: string };

/** A JSON object's text parsed, or null for anything else. */
function jsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const data = JSON.parse(trimmed) as unknown;
    return typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Whether a parsed JSON value is wago JSON of an aura: a transmit table with the aura in `d`. */
export function isWagoJsonObject(data: unknown): boolean {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  const d = (data as Record<string, unknown>).d;
  return typeof d === "object" && d !== null && !Array.isArray(d);
}

/**
 * What an imported file holds. JSON with this app's `format` is a workspace file; a JSON object with an aura in `d`
 * is wago JSON; any other text yields the state codes in it, if any.
 */
export function classifyImportText(text: string): ImportText {
  const data = jsonObject(text);
  if (data?.format === WORKSPACE_FORMAT) return { kind: "workspace", text };
  if (isWagoJsonObject(data)) return { kind: "wago-json", text };
  const codes = findStateCodes(text);
  if (codes.length > 0) return { kind: "codes", codes };
  if (text.trimStart().startsWith("{")) {
    return { kind: "none", error: 'Not wago JSON (no aura in "d"), not a workspace file, and holds no state code (!WA:2!…)' };
  }
  return { kind: "none", error: "Holds no state code (!WA:2!…)" };
}

/** Characters Windows, macOS or Linux won't take in a file name. */
const UNSAFE_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;

/** File name for an aura's code: its id made safe for a file system, `.txt`. */
export function auraFileName(auraId: string): string {
  const base = auraId.replace(UNSAFE_FILE_CHARS, "_").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").slice(0, 120);
  return `${base || "aura"}.txt`;
}

/** File name for a game's workspace file (`.aura-workspace.json`, so a plain `.json` can mean wago JSON). */
export function workspaceFileName(gameId: string, workspaceId: string): string {
  return `${gameId}-${workspaceId}.aura-workspace.json`;
}
