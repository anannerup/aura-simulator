/**
 * The server's check of the textures an aura names: every value that is a path under `Interface\` (a texture,
 * an icon) must be a file the game client has (the game's file list) or one of the game's addon's own files
 * (its folders: `Interface\AddOns\WeakAuras\…`). Anything else draws nothing in game (the page shows a placeholder),
 * so each such path is a `media.texture` info. LibSharedMedia names (fonts, borders, bar textures) are the addon's
 * own validation (`media.<type>`).
 */
import { entries, FULL_VM_ADDONS, isLuaTable, type AuraDocument, type AuraState, type LuaKey, type LuaValue, type ValidationMessage } from "@/core";
import { gameFileKey } from "@/api/files";
import type { GameFiles } from "./game-files";

interface PathUse {
  path: string;
  at: LuaKey[];
  auraId?: string;
}

/** Every string value of the aura that is a game path (`Interface\…`), with where it is. */
function gamePaths(aura: AuraDocument, auraId: string | undefined): PathUse[] {
  const out: PathUse[] = [];
  const walk = (value: LuaValue, at: LuaKey[]) => {
    if (typeof value === "string") {
      if (/^interface\/[^/]/.test(gameFileKey(value))) out.push({ path: value, at, auraId });
    } else if (isLuaTable(value)) {
      for (const [k, v] of entries(value)) walk(v, [...at, k]);
    }
  };
  walk(aura, []);
  return out;
}

/** The options tab a table path is on. */
function pointerOf(at: LuaKey[]): ValidationMessage["pointer"] {
  const label = at.join(".");
  switch (at[0]) {
    case "triggers":
      return { tab: "trigger", trigger: Number(at[1]) || 1, path: at, label };
    case "conditions":
      return { tab: "conditions", condition: Number(at[1]) || undefined, path: at, label };
    case "actions":
      return { tab: "action", path: at, label };
    case "animation":
      return { tab: "animation", path: at, label };
    default:
      return { tab: "region", property: typeof at[0] === "string" ? at[0] : undefined, path: at, label };
  }
}

const OWN_ADDONS = new Set<string>(FULL_VM_ADDONS.map((a) => a.toLowerCase()));

/**
 * `media.texture` infos for the textures of an aura (and a group's children) the game can't draw. Throws when the
 * game's file list can't be downloaded.
 */
export async function textureProblems(files: GameFiles, state: AuraState, gameId: string): Promise<ValidationMessage[]> {
  const isGroup = state.children.length > 0;
  const uses = [state.aura, ...state.children].flatMap((aura) =>
    gamePaths(aura, isGroup && typeof aura.id === "string" ? aura.id : undefined),
  );
  const gamePathsToCheck = uses.filter((u) => !/^interface\/addons\//.test(gameFileKey(u.path))).map((u) => u.path);
  const found = gamePathsToCheck.length ? (await files.lookup({ paths: gamePathsToCheck })).paths : {};
  const problems: ValidationMessage[] = [];
  for (const use of uses) {
    const addon = /^interface\/addons\/([^/]+)\//.exec(gameFileKey(use.path))?.[1];
    let why: string | null = null;
    if (addon !== undefined) {
      if (!OWN_ADDONS.has(addon)) {
        why = `it is a file of another addon ("${addon}"), so only players who have that addon see it; everyone else sees nothing`;
      }
    } else if (!found[use.path]) {
      why = "the game has no such file (it isn't in the game's file list), so nothing is drawn there";
    }
    if (!why) continue;
    problems.push({
      code: "media.texture",
      severity: "info",
      message: `Texture "${use.path}" (${use.at.join(".")}) can't be drawn: ${why}. Find an icon with GET /api/${gameId}/icons/search?q=<words>; check a path with GET /api/${gameId}/files?path=<path>.`,
      pointer: pointerOf(use.at),
      ...(use.auraId !== undefined ? { auraId: use.auraId } : {}),
    });
  }
  return problems;
}
