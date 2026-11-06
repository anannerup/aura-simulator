import path from "node:path";
import { buildPageUrl, needsShortLink, type AddressTarget } from "@/workspace";
import { createWorkspaceHub, type WorkspaceHub, type WorkspaceSnapshot } from "./hub";
import { createShortLinkStore, type ShortLinkStore } from "./short-links";
import { getServerAuraCore } from "./aura-core";
import { toStateCode, type PushInput } from "./push";

export { createWorkspaceHub, type WorkspaceHub, type WorkspaceSnapshot } from "./hub";
export { createShortLinkStore, type ShortLinkStore } from "./short-links";
export { getServerAuraCore } from "./aura-core";
export { parsePushBody, toStateCode, PushError, type PushInput } from "./push";

/** Default database file: `<repo>/data/workspaces.sqlite`, overridable with WORKSPACE_DB_PATH. */
export function defaultWorkspaceDbPath(): string {
  return process.env.WORKSPACE_DB_PATH ?? path.join(process.cwd(), "data", "workspaces.sqlite");
}

const g = globalThis as typeof globalThis & { __shortLinks?: ShortLinkStore; __workspaceHub?: WorkspaceHub };

/** The app's short-link store (kept on globalThis so dev hot reloads reuse the connection). */
export function getShortLinks(): ShortLinkStore {
  g.__shortLinks ??= createShortLinkStore({ dbPath: defaultWorkspaceDbPath() });
  return g.__shortLinks;
}

/** The app's workspace hub (in-memory, one per server process). */
export function getWorkspaceHub(): WorkspaceHub {
  g.__workspaceHub ??= createWorkspaceHub();
  return g.__workspaceHub;
}

/** Page address that opens `code` in `workspaceId`, through a short link when the code is too long. */
export function pageUrlFor(origin: string, workspaceId: string, code: string | null): string {
  const target: AddressTarget = { workspaceId, code };
  if (code && needsShortLink(code)) target.shortId = getShortLinks().put(code);
  return buildPageUrl(origin, target);
}

export interface PushResult {
  workspace: string;
  code: string;
  url: string;
  updatedAt: string;
  revision: number;
}

/** Validates and encodes a push, stores it as the workspace's state and notifies open pages. */
export async function pushToWorkspace(workspaceId: string, input: PushInput, origin: string): Promise<PushResult> {
  const core = await getServerAuraCore();
  const code = toStateCode(core, input);
  const snap: WorkspaceSnapshot = getWorkspaceHub().set(workspaceId, code);
  return {
    workspace: workspaceId,
    code,
    url: pageUrlFor(origin, workspaceId, code),
    updatedAt: snap.updatedAt!,
    revision: snap.revision,
  };
}
