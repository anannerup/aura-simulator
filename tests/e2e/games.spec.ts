import { expect, test } from "@playwright/test";

test("/ is the game picker: each game opens its site, and the title leads back", async ({ page }) => {
  await page.goto("/");
  const games = page.getByRole("list", { name: "Games" });
  await expect(games.getByText("coming soon")).toHaveCount(0);

  await games.getByRole("link", { name: /WoW Forever/ }).click();
  await expect(page).toHaveURL(/\/forever$/);
  await expect(page.getByTestId("workspace-id")).toBeVisible({ timeout: 60_000 });

  await page.getByRole("link", { name: "WoW Forever" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("list", { name: "Games" }).getByRole("link", { name: /TBC Anniversary.*WeakAuras/ }).click();
  await expect(page).toHaveURL(/\/tbc$/);
  // The window: game, addon and the release the version list offers by default (the newest with a zip).
  await expect(page.getByRole("link", { name: "TBC Anniversary" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /^WeakAuras 5\.22\.1/ })).toBeVisible({ timeout: 90_000 });
  const tbcWindow = page.getByRole("region", { name: "WeakAuras options" });
  await expect(tbcWindow.getByTestId("workspace-id")).toBeVisible();

  await page.getByRole("link", { name: "TBC Anniversary" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("list", { name: "Games" })).toBeVisible();
});

test("the old unscoped routes are gone, and unknown games are not found", async ({ request }) => {
  // The e2e server is fresh: the first request for an unknown game's page must already answer 404 (a production
  // server served its prerendered shell with 200 before; .scratch/test-speed/issues/01-unknown-game-pages-answer-200.md).
  for (const path of ["/llms.txt", "/docs/agents", "/docs/agents.md", "/api/workspaces/x", "/api/addon/versions", "/api/spells/status", "/api/icons?files=1", "/classic", "/classic/docs/agents", "/classic/fonts", "/classic/render", "/api/classic/addon/versions"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("workspaces are per game on the server", async ({ request }) => {
  const id = `games-${Date.now().toString(36)}`;
  const res = await request.post(`/api/forever/workspaces/${id}/aura?validate=false`, {
    data: { aura: { id: "Per game", regionType: "icon", width: 40, height: 40 } },
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).url).toMatch(new RegExp(`/forever\\?w=${id}$`));
  expect((await (await request.get(`/api/forever/workspaces/${id}`)).json()).code).toMatch(/^!WA:2!/);
  // The same id on TBC is another workspace: nothing pushed there yet.
  expect((await (await request.get(`/api/tbc/workspaces/${id}`)).json()).code).toBeNull();
});
