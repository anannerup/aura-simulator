/** The push API and its in-memory hub of recent pushes per workspace. Server only. */
import { isWorkspaceId } from "@/workspace";

/** The 400 answer for a route's workspace id that isn't one; null for a valid id. */
export function rejectWorkspaceId(id: string): Response | null {
  return isWorkspaceId(id) ? null : Response.json({ error: "Workspace IDs are 1-64 of A-Z a-z 0-9 _ -" }, { status: 400 });
}

export { createWorkspaceHub, getWorkspaceHub, notice, type WorkspaceHub } from "./hub";
export {
  MAX_PUSH_BYTES,
  parsePushBody,
  PushError,
  pushToWorkspace,
  readBodyText,
  toStateCode,
  type PushInput,
  type PushOptions,
  type PushResult,
} from "./push";
