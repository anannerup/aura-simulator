import { auraRules, DEFAULT_SITUATION, previewSituation, readSituation, situationJson, SituationError, type SituationPreview } from "@/core";
import { getServerAuraCore } from "@/server/addon/core";
import type { ServerGame } from "@/server/game";
import { errorMessage } from "@/lib/errors";
import { getWorkspaceHub } from "./hub";
import { PushError } from "./push";

export interface SituationAnswer {
  workspace: string;
  /** The workspace's situation (the default until an agent sets one). */
  situation: Record<string, unknown>;
  /** True once an agent set it: open pages show it (until the player changes it there). */
  set: boolean;
  /** What each display of the workspace's latest aura shows in it; null before anything was pushed. */
  preview: SituationPreview | null;
}

/**
 * The situation an agent sets for a workspace: open pages' game screens take it over (event `situation`), and every
 * later push answers with what the aura shows in it. `body` is the JSON text (`readSituation`: a whole situation).
 */
export async function setWorkspaceSituation(server: ServerGame, workspaceId: string, body: string, ref?: string | null): Promise<SituationAnswer> {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (e) {
    throw new PushError(`Not JSON (${errorMessage(e)}). Send a situation: {"targetExists", "inCombat", "triggers": {"1": {...}}}`);
  }
  let situation;
  try {
    situation = readSituation(value, server.game.id);
  } catch (e) {
    throw new PushError(e instanceof SituationError ? e.message : errorMessage(e));
  }
  getWorkspaceHub(server.game.id).setSituation(workspaceId, situation);
  return workspaceSituation(server, workspaceId, ref);
}

/** The workspace's situation and what its latest aura shows in it. */
export async function workspaceSituation(server: ServerGame, workspaceId: string, ref?: string | null): Promise<SituationAnswer> {
  const hub = getWorkspaceHub(server.game.id);
  const stored = hub.getSituation(workspaceId);
  const situation = stored ?? DEFAULT_SITUATION;
  const { code } = hub.get(workspaceId);
  let preview: SituationPreview | null = null;
  if (code) {
    const core = await getServerAuraCore(server, ref);
    const state = core.decode(code);
    // Forever's Aura (Modern) conditions only run when the addon accepts them: that verdict needs its validation.
    const rules = auraRules(server.game.id);
    const modern = [state.aura, ...state.children].some((a) => rules.auraTriggers(a).some((t) => t.kind === "secretAura"));
    preview = previewSituation(state, situation, server.game.id, modern ? await core.validate(state) : null);
  }
  return { workspace: workspaceId, situation: situationJson(situation), set: stored !== null, preview };
}
