import type { AuraState } from "@/core";
import { readPushInput } from "@/workspace";
import type { WorkspaceSession } from "./session";
import { errorMessage } from "@/lib/errors";

/**
 * `window.auraSimulator`: the in-page command for agents driving the page in a browser tab (documented in the agent
 * docs). It exists once the workspace is restored.
 */
export interface AuraSimulatorApi {
  /** The workspace this page follows (`?w=`). */
  workspaceId: string;
  /**
   * Loads an aura the way a push does: wago JSON (object or text), a state code, `{code}`, or `{aura, children?}`
   * (not wago links: those need the server). It replaces the top-level aura
   * with the same uid (else id) or is added, and is selected. Resolves once the addon's import has accepted it.
   */
  load(input: unknown): Promise<{ ok: true; id: string; code: string } | { ok: false; error: string }>;
  /** The state code of an aura (an aura, or a group with everything in it); the selected one by default. */
  code(id?: string): string | null;
  /** An aura's document and a group's descendants (what `load` takes); the selected one by default. */
  state(id?: string): AuraState | null;
}

declare global {
  interface Window {
    auraSimulator?: AuraSimulatorApi;
  }
}

/** Installs `window.auraSimulator` for a restored session; returns the uninstall. */
export function installPageApi(session: WorkspaceSession, workspaceId: string): () => void {
  const api: AuraSimulatorApi = {
    workspaceId,
    async load(input) {
      try {
        return await session.load(readPushInput(input));
      } catch (e) {
        return { ok: false, error: errorMessage(e) };
      }
    },
    code: (id) => session.codeOf(id),
    state: (id) => session.stateOf(id),
  };
  window.auraSimulator = api;
  return () => {
    if (window.auraSimulator === api) delete window.auraSimulator;
  };
}
