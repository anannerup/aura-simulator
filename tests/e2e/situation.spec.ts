import { expect, test, type Page } from "@playwright/test";

const trigger = (page: Page, n = 1) => page.getByRole("group", { name: new RegExp(`^Trigger ${n}:`) });
const region = (page: Page) => page.getByTestId("aura-preview").locator("[data-region-type]");
const icon = (page: Page) => region(page).locator("img");

test("time left slider drives %p text, its colour and the glow (Aura (Modern))", async ({ page }) => {
  await page.goto("/lab?example=buff-running-low");
  const text = region(page).locator('[data-subregion="subtext"]');
  const glow = region(page).locator('[data-subregion="subglow"]');
  await expect(text).toHaveText("45.0");
  await expect(glow).toHaveAttribute("data-glow", "on");
  await expect(icon(page)).toHaveCSS("filter", "grayscale(1)");

  await trigger(page).getByLabel("Duration").fill("3600");
  await trigger(page).getByLabel("Time left").fill("1000");
  await expect(text).toHaveText("16:40");
  await expect(glow).toHaveAttribute("data-glow", "off");
  await expect(text).toHaveCSS("color", "rgb(255, 255, 255)");

  await trigger(page).getByLabel("Time left").fill("5");
  await expect(text).toHaveText("5.0");
  await expect(text).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(glow).toHaveAttribute("data-glow", "on");

  // The cooldown swipe follows the time left.
  await expect(region(page).getByTestId("cooldown-swipe")).toBeVisible();

  await trigger(page).getByLabel("Aura present").uncheck();
  await expect(region(page)).toHaveCount(0);
});

test("present/missing toggle shows the missing aura desaturated and glowing", async ({ page }) => {
  await page.goto("/lab?example=buff-missing");
  await expect(region(page)).toHaveCount(0);
  await trigger(page).getByLabel("Aura present").uncheck();
  await expect(icon(page)).toHaveCSS("filter", "grayscale(1)");
  await expect(region(page).locator('[data-subregion="subglow"]')).toHaveAttribute("data-glow", "on");
  await expect(region(page).getByTestId("cooldown")).toHaveCount(0);
  // Still works in combat, and Aura (Modern) never shows the padlock.
  await page.getByRole("switch", { name: "In combat" }).check();
  await expect(icon(page)).toHaveCSS("filter", "grayscale(1)");
  await expect(page.getByTestId("frozen-marker")).toHaveCount(0);
});

test("spell cooldown: desaturated while on cooldown, charges as stack text", async ({ page }) => {
  await page.goto("/lab?example=cooldown-icon");
  await expect(icon(page)).toHaveCSS("filter", "grayscale(1)");
  await expect(region(page).getByTestId("cooldown-text")).toHaveText("45");
  await trigger(page).getByLabel("On cooldown").uncheck();
  await expect(icon(page)).toHaveCSS("filter", "none");
  await expect(region(page).getByTestId("cooldown")).toHaveCount(0);
  await trigger(page).getByLabel("Charges").fill("2");
  await expect(region(page).locator('[data-subregion="subtext"]')).toHaveText("2");
});

test("target exists, stacks and the in-combat padlock on a frozen aura2 trigger", async ({ page }) => {
  await page.goto("/lab?example=target-debuff");
  await expect(region(page)).toBeVisible();
  await page.getByLabel("Target exists").uncheck();
  await expect(region(page)).toHaveCount(0);
  await page.getByLabel("Target exists").check();

  const stacks = trigger(page).getByLabel("Stacks");
  await stacks.fill("3");
  await expect(region(page).getByTestId("icon-tint")).toBeVisible();
  await expect(region(page).locator('[data-subregion="subtext"]').nth(1)).toHaveText("3");
  await stacks.fill("1");
  await expect(region(page).getByTestId("icon-tint")).toHaveCount(0);

  await page.getByRole("switch", { name: "In combat" }).check();
  await expect(page.getByTestId("frozen-marker")).toBeVisible();
  // Frozen: changes in combat don't reach the aura.
  await stacks.fill("4");
  await expect(region(page).getByTestId("icon-tint")).toHaveCount(0);
  await trigger(page).getByLabel("Aura present").uncheck();
  await expect(region(page)).toBeVisible();

  await page.getByRole("switch", { name: "In combat" }).uncheck();
  await expect(page.getByTestId("frozen-marker")).toHaveCount(0);
  await expect(region(page)).toHaveCount(0);
});

test("a condition Aura (Modern) does not allow is reported and never applies", async ({ page }) => {
  await page.goto("/lab?example=remaining-desaturates");
  await expect(page.getByTestId("condition-problem")).toContainText("supported property");
  await trigger(page).getByLabel("Time left").fill("3");
  await expect(icon(page)).toHaveCSS("filter", "none");
});

test("the main page's situation controls drive the sample aura", async ({ page }) => {
  await page.goto("/");
  await expect(region(page)).toBeVisible({ timeout: 60_000 });
  await trigger(page).getByLabel("Aura present").uncheck();
  await expect(region(page)).toHaveCount(0);
  await trigger(page).getByLabel("Aura present").check();
  await expect(region(page)).toBeVisible();
});
