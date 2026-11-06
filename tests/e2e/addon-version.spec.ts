import { expect, test, type Page } from "@playwright/test";

const loaded = (page: Page) => page.getByTestId("addon-loaded");

async function expectAuraRendered(page: Page) {
  const icon = page.getByTestId("aura-preview").locator('[data-region-type="icon"] img');
  await expect(icon).toBeVisible();
  await expect(page.getByLabel("State code")).toHaveValue(/^!WA:2![A-Za-z0-9()]+$/);
}

test("the newest release loads by default, through the server's addon cache", async ({ page }) => {
  const fileRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/addon/") && r.url().includes("/file?")) fileRequests.push(r.url());
  });
  await page.goto("/");
  await expect(loaded(page)).toContainText("Musca Auras v1.15.0", { timeout: 60_000 });
  await expect(loaded(page)).toContainText("WeakAuras 5.22.0 · internal version 92");
  await expect(page.getByLabel("Musca Auras version")).toHaveValue("v1.15.0");
  await expectAuraRendered(page);
  expect(fileRequests.some((u) => u.includes("WeakAuras%2FInit.lua"))).toBe(true);
});

test("switching version reloads the core, keeps the aura and reports what changed", async ({ page }) => {
  await page.goto("/");
  await expect(loaded(page)).toContainText("v1.15.0", { timeout: 60_000 });

  await page.getByLabel("Musca Auras version").selectOption("v1.10.0");
  await expect(loaded(page)).toContainText("Musca Auras v1.10.0", { timeout: 60_000 });
  await expect(loaded(page)).toContainText("internal version 91");
  await expectAuraRendered(page);

  const diff = page.getByTestId("addon-diff");
  await expect(diff).toContainText("What changed from v1.15.0 to v1.10.0");
  await expect(diff).toContainText(/Files: \d+ added, \d+ removed, \d+ changed/, { timeout: 120_000 });

  // The choice is remembered.
  await page.reload();
  await expect(loaded(page)).toContainText("Musca Auras v1.10.0", { timeout: 60_000 });
});

test("a branch loads by name; an unknown ref shows an error and keeps the previous version", async ({ page }) => {
  await page.goto("/");
  await expect(loaded(page)).toContainText("v1.15.0", { timeout: 60_000 });

  const input = page.getByLabel("Branch or commit");
  await input.fill("main");
  await page.getByRole("button", { name: "Load" }).click();
  await expect(loaded(page)).toContainText(/Musca Auras main \([0-9a-f]{7}\)/, { timeout: 60_000 });

  await input.fill("no-such-branch");
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not load" })).toContainText('no release, branch or commit called "no-such-branch"');
  await expect(page.getByRole("alert").filter({ hasText: "Could not load" })).toContainText("Still using main");
  await expect(loaded(page)).toContainText("Musca Auras main");
  await expectAuraRendered(page);
});

test("without the server's addon routes, the core loads straight from jsDelivr", async ({ page }) => {
  await page.route("**/api/addon/**", (route) => route.fulfill({ status: 500, body: "down" }));
  await page.goto("/");
  await expect(loaded(page)).toContainText("Musca Auras v1.15.0", { timeout: 60_000 });
  await expectAuraRendered(page);
});
