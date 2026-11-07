import { expect, type Page } from "@playwright/test";
import type { AddonGameId, AuraDocument } from "@/core";

/**
 * A game's site on a workspace of its own. Without `?w=` the page follows the shared `default`
 * workspace, which the server keeps across tests and runs: a spell picked or code pushed in one test
 * would show up in the next (and live, over SSE, in tests running in parallel).
 */
export function ownWorkspacePage(prefix: string, game: AddonGameId = "forever"): string {
  return `/${game}?w=${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Pushes an aura (or a group with its descendants) to a workspace of its own, as an agent would, and opens the window
 * on it: what the game screen shows went through decode, defaults and the renderers. Returns once the aura's situation
 * controls are up (the page is hydrated and the aura loaded). Pushing again to the returned id updates the page live.
 */
export async function openPushed(page: Page, aura: AuraDocument, children: AuraDocument[] = [], game: AddonGameId = "forever"): Promise<string> {
  const path = ownWorkspacePage(typeof aura.id === "string" ? aura.id.replace(/\W+/g, "-").toLowerCase() : "aura", game);
  const id = path.slice(`/${game}?w=`.length);
  await push(page, id, aura, children, game);
  await page.goto(path);
  await expect(page.getByRole("region", { name: "Situation" }).first()).toBeVisible({ timeout: 90_000 });
  return id;
}

/** Pushes an aura to a game's workspace (an open page on it follows). */
export async function push(page: Page, workspace: string, aura: AuraDocument, children: AuraDocument[] = [], game: AddonGameId = "forever") {
  const res = await page.request.post(`/api/${game}/workspaces/${workspace}/aura?validate=false`, { data: { aura, children } });
  expect(res.ok(), await res.text()).toBe(true);
}
