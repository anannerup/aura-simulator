import {
  auraRules,
  conditionProblem,
  DEFAULT_SITUATION,
  readSituation,
  situationJson,
  SituationError,
  type AddonGameId,
  type ConditionProblem,
  type Situation,
} from "@/core";
import type { RenderScene } from "@/api/render";
import { getServerAuraCore, resolveServerRef } from "@/server/addon/core";
import type { ServerGame } from "@/server/game";
import { errorMessage } from "@/lib/errors";
import { findNode, nodeFromState, traverse, type RenderOptions, type WorkspaceNode } from "@/workspace";
import { getWorkspaceHub } from "./hub";
import { PushError } from "./push";


/**
 * The scene for the render page and the screenshot endpoint: the workspace's latest push, or with `options.aura` the
 * newest kept push holding that aura (the server keeps a workspace's last few pushes; each is one top-level aura), in
 * `options.situation` or else the workspace's situation. Throws `PushError` (404: nothing to draw; 400: a bad
 * situation).
 */
export async function renderScene(server: ServerGame, workspaceId: string, options: RenderOptions): Promise<RenderScene> {
  const game = server.game.id;
  const situation = options.situation === null ? (getWorkspaceHub(game).getSituation(workspaceId) ?? DEFAULT_SITUATION) : parseSituation(options.situation, game);
  const core = await getServerAuraCore(server, options.ref);
  const { ref } = await resolveServerRef(server, options.ref);
  const hub = getWorkspaceHub(game);
  const latest = hub.get(workspaceId);
  if (!latest.code) throw new PushError(`Nothing was pushed to workspace "${workspaceId}" yet (or the page hasn't changed an aura there)`, 404);
  for (let revision = latest.revision; revision > 0; revision--) {
    const snap = hub.get(workspaceId, revision);
    if (!snap?.code) break;
    const node = nodeFromState(core.decode(snap.code));
    const target = options.aura === null ? node : findNode([node], options.aura)?.node;
    if (!target) continue;
    return {
      ref,
      revision,
      node,
      auraId: String(target.aura.id),
      situation: situationJson(situation),
      problems: await modernProblems(core, node, game),
    };
  }
  throw new PushError(`No recent push to workspace "${workspaceId}" has an aura "${options.aura}"`, 404);
}

function parseSituation(text: string, game: AddonGameId): Situation {
  try {
    return readSituation(JSON.parse(text), game);
  } catch (e) {
    throw new PushError(`situation: ${e instanceof SituationError ? e.message : errorMessage(e)}`);
  }
}

/** As the page does (`useConditionProblems`): each aura with an Aura (Modern) trigger validated on its own. */
async function modernProblems(
  core: Awaited<ReturnType<typeof getServerAuraCore>>,
  node: WorkspaceNode,
  game: AddonGameId,
): Promise<[string, ConditionProblem][]> {
  const rules = auraRules(game);
  const found: [string, ConditionProblem][] = [];
  for (const n of traverse([node])) {
    if (n.items || !rules.auraTriggers(n.aura).some((t) => t.kind === "secretAura")) continue;
    const problem = conditionProblem(await core.validate({ aura: n.aura, children: [] }).catch(() => undefined));
    if (problem && typeof n.aura.id === "string") found.push([n.aura.id, problem]);
  }
  return found;
}
