import { expect, test } from "@playwright/test";

test("/ is the game picker: Forever opens its site, TBC Anniversary is coming soon, the title leads back", async ({ page }) => {
  await page.goto("/");
  const games = page.getByRole("list", { name: "Games" });
  await expect(games.getByText("TBC Anniversary")).toBeVisible();
  await expect(games.getByText("WeakAuras · coming soon")).toBeVisible();
  await expect(games.getByRole("link", { name: /TBC Anniversary/ })).toHaveCount(0);

  await games.getByRole("link", { name: /WoW Forever/ }).click();
  await expect(page).toHaveURL(/\/forever$/);
  await expect(page.getByTestId("workspace-id")).toBeVisible({ timeout: 60_000 });

  await page.getByRole("link", { name: "WoW Forever" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("list", { name: "Games" })).toBeVisible();
});

test("the old unscoped routes are gone, and unknown games are not found", async ({ request }) => {
  for (const path of ["/llms.txt", "/docs/agents", "/docs/agents.md", "/api/workspaces/x", "/api/addon/versions", "/api/spells/status", "/api/icons?files=1", "/tbc"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  expect((await request.get("/api/tbc/addon/versions")).status()).toBe(404);
});

test("workspaces are per game on the server", async ({ request }) => {
  const id = `games-${Date.now().toString(36)}`;
  const res = await request.post(`/api/forever/workspaces/${id}/aura?validate=false`, {
    data: { aura: { id: "Per game", regionType: "icon", width: 40, height: 40 } },
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).url).toMatch(new RegExp(`/forever\\?w=${id}$`));
  expect((await (await request.get(`/api/forever/workspaces/${id}`)).json()).code).toMatch(/^!WA:2!/);
  expect((await request.post(`/api/tbc/workspaces/${id}/aura`, { data: { code: "!WA:2!x" } })).status()).toBe(404);
});
