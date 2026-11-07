/**
 * Files the player imports and exports. Auras can be megabytes, so files (not the address) carry them:
 *
 * - An **aura file** (`<aura name>.txt`): exactly one state code (`!WA:2!...`), UTF-8, nothing else, so the
 *   player can open it and paste it into the game's import dialog.
 * - A **workspace file** (`.json`): the whole workspace, format v2 (see `workspace.ts`).
 *
 * Importing accepts either: any text holding one or more state codes (several, e.g. one per line), or a
 * workspace file. Pure; the page reads the files and the session applies them.
 */
import { findStateCodes } from "@/core";
import { WORKSPACE_FORMAT } from "./workspace";

export type ImportText =
  /** A workspace file: hand the text to `readWorkspace` (the page asks whether to replace or merge). */
  | { kind: "workspace"; text: string }
  /** State codes found in the text, in order (unchecked: decode them before trusting them). */
  | { kind: "codes"; codes: string[] }
  | { kind: "none"; error: string };

/** Whether a text is a workspace file: JSON with this app's `format`. */
function isWorkspaceJson(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{")) return false;
  try {
    const data = JSON.parse(trimmed) as { format?: unknown } | null;
    return typeof data === "object" && data !== null && data.format === WORKSPACE_FORMAT;
  } catch {
    return false;
  }
}

/** What an imported file holds. JSON that isn't a workspace file still yields the codes in it, if any. */
export function classifyImportText(text: string): ImportText {
  if (isWorkspaceJson(text)) return { kind: "workspace", text };
  const codes = findStateCodes(text);
  if (codes.length > 0) return { kind: "codes", codes };
  if (text.trimStart().startsWith("{")) return { kind: "none", error: "Not a workspace file and holds no state code (!WA:2!…)" };
  return { kind: "none", error: "Holds no state code (!WA:2!…)" };
}

/** Characters Windows, macOS or Linux won't take in a file name. */
const UNSAFE_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;

/** File name for an aura's code: its id made safe for a file system, `.txt`. */
export function auraFileName(auraId: string): string {
  const base = auraId.replace(UNSAFE_FILE_CHARS, "_").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").slice(0, 120);
  return `${base || "aura"}.txt`;
}

/** File name for a workspace file. */
export function workspaceFileName(workspaceId: string): string {
  return `aura-workspace-${workspaceId}.json`;
}
