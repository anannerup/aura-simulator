import { expect, test, type Page } from "@playwright/test";
import { ownWorkspacePage } from "../support/e2e-workspace";
import { stateCode } from "../support/state-code";

const loaded = (page: Page) => page.getByTestId("addon-loaded");
/** The version picker lives in a popover under the top bar's version button. */
const openPicker = (page: Page) => page.getByRole("button", { name: /^Musca Auras / }).click();

async function expectAuraRendered(page: Page) {
  const icon = page.getByTestId("aura-preview").locator('[data-region-type="icon"] img');
  await expect(icon).toBeVisible();
  await expect.poll(() => stateCode(page)).toMatch(/^!WA:2![A-Za-z0-9()]+$/);
}

test("the newest release loads by default, through the server's addon cache", async ({ page }) => {
  const bundleRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/forever/addon/") && r.url().includes("/bundle?")) bundleRequests.push(r.url());
  });
  await page.goto(ownWorkspacePage("addon"));
  await expect(loaded(page)).toContainText("Musca Auras v1.15.0", { timeout: 60_000 });
  await expect(loaded(page)).toContainText("WeakAuras 5.22.0 · internal version 92");
  await expect(page.getByLabel("Musca Auras version")).toHaveValue("v1.15.0");
  await expectAuraRendered(page);
  expect(bundleRequests.some((u) => u.includes("/api/forever/addon/v1.15.0/bundle?set=full"))).toBe(true);
});

test("switching version reloads the core, keeps the aura and reports what changed", async ({ page }) => {
  await page.goto(ownWorkspacePage("addon"));
  await expect(loaded(page)).toContainText("v1.15.0", { timeout: 60_000 });

  // Change the workspace's aura (not the sample), so "kept" can't be the fallback sample coming back.
  const icon = page.getByTestId("aura-preview").locator('[data-region-type="icon"] img');
  const search = page.getByRole("combobox", { name: "Search spells" });
  await search.fill("frostbolt");
  await page.getByRole("listbox", { name: "Spells" }).getByRole("option", { name: /Frostbolt/ }).first().click();
  await expect(icon).toHaveAttribute("src", /spell_frost_frostbolt02/);
  const code = await stateCode(page);

  await openPicker(page);
  await page.getByLabel("Musca Auras version").selectOption("v1.10.0");
  await expect(loaded(page)).toContainText("Musca Auras v1.10.0", { timeout: 60_000 });
  await expect(loaded(page)).toContainText("internal version 91");
  await expectAuraRendered(page);
  await expect.poll(() => stateCode(page)).toBe(code);
  await expect(icon).toHaveAttribute("src", /spell_frost_frostbolt02/);
  await expect(page.getByTestId("current-spell")).toContainText("ID 116");

  const diff = page.getByTestId("addon-diff");
  await expect(diff).toContainText("What changed from v1.15.0 to v1.10.0");
  await expect(diff).toContainText(/Files: \d+ added, \d+ removed, \d+ changed/, { timeout: 120_000 });

  // The choice is remembered.
  await page.reload();
  await expect(loaded(page)).toContainText("Musca Auras v1.10.0", { timeout: 60_000 });
  await expect.poll(() => stateCode(page)).toBe(code);
});

test("the picker offers released tags only; an unknown release shows an error and keeps the version", async ({ page, request }) => {
  await page.goto(ownWorkspacePage("addon"));
  await expect(loaded(page)).toContainText("v1.15.0", { timeout: 60_000 });
  await openPicker(page);
  const options = await page.getByLabel("Musca Auras version").locator("option").allTextContents();
  expect(options.every((o) => /^v?\d+\.\d+\.\d+/.test(o))).toBe(true);
  await expect(page.getByLabel("Branch or commit")).toHaveCount(0);

  // Branches and commits don't resolve, on the server either.
  const res = await request.get("/api/forever/addon/resolve?ref=main");
  expect(res.status()).toBe(404);
  expect((await res.json()).error).toBe('Musca Auras has no release called "main"');
  expect((await request.get("/api/forever/addon/versions").then((r) => r.json())).branches).toBeUndefined();
});
