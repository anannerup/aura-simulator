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
    if (r.url().includes("/api/addon/") && r.url().includes("/bundle?")) bundleRequests.push(r.url());
  });
  await page.goto(ownWorkspacePage("addon"));
  await expect(loaded(page)).toContainText("Musca Auras v1.15.0", { timeout: 60_000 });
  await expect(loaded(page)).toContainText("WeakAuras 5.22.0 · internal version 92");
  await expect(page.getByLabel("Musca Auras version")).toHaveValue("v1.15.0");
  await expectAuraRendered(page);
  expect(bundleRequests.some((u) => u.includes("/api/addon/v1.15.0/bundle?set=full"))).toBe(true);
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

test("a branch loads by name; an unknown ref shows an error and keeps the previous version", async ({ page }) => {
  await page.goto(ownWorkspacePage("addon"));
  await expect(loaded(page)).toContainText("v1.15.0", { timeout: 60_000 });

  await openPicker(page);
  const input = page.getByLabel("Branch or commit");
  await input.fill("main");
  await page.getByRole("region", { name: "Addon version picker" }).getByRole("button", { name: "Switch" }).click();
  await expect(loaded(page)).toContainText(/Musca Auras main \([0-9a-f]{7}\)/, { timeout: 60_000 });

  await input.fill("no-such-branch");
  await page.getByRole("region", { name: "Addon version picker" }).getByRole("button", { name: "Switch" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not load" })).toContainText('no release, branch or commit called "no-such-branch"');
  await expect(page.getByRole("alert").filter({ hasText: "Could not load" })).toContainText("Still using main");
  await expect(loaded(page)).toContainText("Musca Auras main");
  await expectAuraRendered(page);
});

test("without the server's addon routes, the core loads straight from jsDelivr", async ({ page, request }) => {
  await page.route("**/api/addon/**", (route) => route.fulfill({ status: 500, body: "down" }));
  // jsDelivr itself is answered from the server's addon cache (outside the page, so not blocked above): repeat runs
  // need no network.
  const fromJsDelivr: string[] = [];
  await page.route("https://cdn.jsdelivr.net/gh/dldvlpr-addons-wow/Musca-Auras@*/**", async (route) => {
    const m = /\/Musca-Auras@([^/]+)\/(.+)$/.exec(new URL(route.request().url()).pathname)!;
    const [ref, file] = [decodeURIComponent(m[1]), decodeURIComponent(m[2])];
    fromJsDelivr.push(file);
    const res = await request.get(`/api/addon/${encodeURIComponent(ref)}/file?path=${encodeURIComponent(file)}`);
    await route.fulfill({ status: res.status(), body: await res.body(), contentType: "text/plain; charset=utf-8" });
  });
  await page.goto(ownWorkspacePage("addon"));
  await expect(loaded(page)).toContainText("Musca Auras v1.15.0", { timeout: 60_000 });
  await expectAuraRendered(page);
  expect(fromJsDelivr).toContain("WeakAuras/Init.lua");
  await page.unrouteAll({ behavior: "ignoreErrors" }); // textures may still be loading
});
