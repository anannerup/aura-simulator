import { expect, test, type Page } from "@playwright/test";
import { buffMissing, buffUnderThreeMinutes, cooldownIcon, remainingDesaturates, targetDebuffAura2 } from "../../src/games/forever/examples";
import { openPushed, ownWorkspacePage } from "../support/e2e-workspace";

test.describe.configure({ timeout: 150_000 });

const trigger = (page: Page, n = 1) => page.getByRole("group", { name: new RegExp(`^Trigger ${n}:`) });
const region = (page: Page) => page.getByTestId("aura-preview").locator("[data-region-type]");
const icon = (page: Page) => region(page).locator("img");

test("v1 aura 1a: shown under 3 minutes, desaturated, %p text red and glowing as it runs out", async ({ page }) => {
  await openPushed(page, buffUnderThreeMinutes);
  const text = region(page).locator('[data-subregion="subtext"]');
  const glow = region(page).locator('[data-subregion="subglow"]');
  await expect(text).toHaveText("45.0");
  await expect(glow).toHaveAttribute("data-glow", "off");
  await expect(icon(page)).toHaveCSS("filter", "grayscale(1)");

  // Over 3 minutes left: the trigger's Remaining Time window hides it.
  await trigger(page).getByLabel("Duration").fill("3600");
  await trigger(page).getByLabel("Time left").fill("1000");
  await expect(region(page)).toHaveCount(0);

  await trigger(page).getByLabel("Time left").fill("100");
  await expect(text).toHaveText("1:40");
  await expect(glow).toHaveAttribute("data-glow", "off");
  await expect(text).toHaveCSS("color", "rgb(255, 255, 255)");

  await trigger(page).getByLabel("Time left").fill("20");
  await expect(glow).toHaveAttribute("data-glow", "on");

  await trigger(page).getByLabel("Time left").fill("5");
  await expect(text).toHaveText("5.0");
  await expect(text).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(glow).toHaveAttribute("data-glow", "on");
  await expect(icon(page)).toHaveCSS("filter", "grayscale(1)");

  // The cooldown swipe follows the time left; all of it keeps working in combat.
  await expect(region(page).getByTestId("cooldown-swipe")).toBeVisible();
  await page.getByRole("switch", { name: "In combat" }).check();
  await expect(glow).toHaveAttribute("data-glow", "on");
  await expect(page.getByTestId("frozen-marker")).toHaveCount(0);

  await trigger(page).getByLabel("Aura present").uncheck();
  await expect(region(page)).toHaveCount(0);
});

test("v1 aura 1b: the present/missing toggle shows the missing aura desaturated and glowing", async ({ page }) => {
  await openPushed(page, buffMissing);
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
  await openPushed(page, cooldownIcon);
  await expect(icon(page)).toHaveCSS("filter", "grayscale(1)");
  await expect(region(page).getByTestId("cooldown-text")).toHaveText("45");
  await trigger(page).getByLabel("On cooldown").uncheck();
  await expect(icon(page)).toHaveCSS("filter", "none");
  await expect(region(page).getByTestId("cooldown")).toHaveCount(0);
  await trigger(page).getByLabel("Charges").fill("2");
  await expect(region(page).locator('[data-subregion="subtext"]')).toHaveText("2");
});

test("target exists, stacks and the in-combat padlock on a frozen aura2 trigger", async ({ page }) => {
  await openPushed(page, targetDebuffAura2);
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

test("a condition Aura (Modern) rejects is reported by the combat check and never applies on the game screen", async ({ page }) => {
  await openPushed(page, remainingDesaturates);
  const panel = page.getByTestId("validation-panel");
  await expect(panel.locator('li[data-code="modern.invalid"]')).toContainText("supported property", { timeout: 90_000 });
  await trigger(page).getByLabel("Time left").fill("3");
  await expect(icon(page)).toHaveCSS("filter", "none");
});

test("the main page's situation controls drive the sample aura", async ({ page }) => {
  await page.goto(ownWorkspacePage("situation"));
  await expect(region(page)).toBeVisible({ timeout: 60_000 });
  await trigger(page).getByLabel("Aura present").uncheck();
  await expect(region(page)).toHaveCount(0);
  await trigger(page).getByLabel("Aura present").check();
  await expect(region(page)).toBeVisible();
});
