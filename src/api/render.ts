/**
 * What the server hands the render page (`/<game>/render`, `renderScene`): shared by the server and the page. No
 * server code here.
 */
import type { ConditionProblem } from "@/core";
import type { WorkspaceNode } from "@/workspace";

/** One top-level aura of a workspace to draw, in a situation. Plain JSON. */
export interface RenderScene {
  /** The addon release (its media: textures, fonts). */
  ref: string;
  /** The push it comes from. */
  revision: number;
  /** The top-level aura holding the aura to draw (a group with everything in it), drawn whole as the game does. */
  node: WorkspaceNode;
  /** The aura (or group) whose bounds the picture is cropped to. */
  auraId: string;
  /** The situation, as JSON (`situationJson`; the page reads it back with `readSituation`). */
  situation: Record<string, unknown>;
  /** The addon's verdict on Aura (Modern) conditions, by aura id (Forever only; as `useConditionProblems`). */
  problems: [string, ConditionProblem][];
}
