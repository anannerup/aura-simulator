import { buildPageUrl } from "@/workspace";
import { createWorkspaceHub, type WorkspaceHub, type WorkspaceSnapshot } from "./hub";
import { getServerAuraCore } from "@/server/addon/core";
import { toStateCode, type PushInput } from "./push";
import type { ValidationResult } from "@/core";

export { createWorkspaceHub, notice, type WorkspaceHub, type WorkspaceNotice, type WorkspaceSnapshot } from "./hub";
export { parsePushBody, readBodyText, toStateCode, PushError, MAX_PUSH_BYTES, type PushInput } from "./push";

const g = globalThis as typeof globalThis & { __workspaceHub?: WorkspaceHub };

/** The app's workspace hub (in-memory, one per server process). */
export function getWorkspaceHub(): WorkspaceHub {
  g.__workspaceHub ??= createWorkspaceHub();
  return g.__workspaceHub;
}

/** Page address that follows a workspace (`?w=`; auras never travel in the address). */
export function pageUrlFor(origin: string, workspaceId: string): string {
  return buildPageUrl(origin, workspaceId);
}

export interface PushResult {
  workspace: string;
  code: string;
  /** The page that follows this workspace. */
  url: string;
  updatedAt: string;
  revision: number;
  /** The addon's own checks and combat warnings for the pushed aura (null when skipped). Export is never blocked. */
  validation: ValidationResult | null;
}

export interface PushOptions {
  /** The page that sent it (its client header), so it can skip its own change in the event stream. */
  source?: string | null;
  /** False skips the addon validation in the answer (the page validates itself). Default true. */
  validate?: boolean;
  /** Addon version (release, branch or commit) to encode and validate with. Default: the server's (resolveServerRef). */
  ref?: string | null;
}

/** Validates and encodes a push, stores it as the workspace's state and notifies open pages. */
export async function pushToWorkspace(
  workspaceId: string,
  input: PushInput,
  origin: string,
  options: PushOptions = {},
): Promise<PushResult> {
  const core = await getServerAuraCore(options.ref);
  const code = toStateCode(core, input);
  const snap: WorkspaceSnapshot = getWorkspaceHub().set(workspaceId, code, options.source ?? null);
  return {
    workspace: workspaceId,
    code,
    url: pageUrlFor(origin, workspaceId),
    updatedAt: snap.updatedAt!,
    revision: snap.revision,
    validation: options.validate === false ? null : await core.validate(core.decode(code)),
  };
}
