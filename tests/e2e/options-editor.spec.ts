import { expect, test, type Locator, type Page } from "@playwright/test";

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const editor = (page: Page) => page.getByRole("region", { name: "Aura options" });
const option = (page: Page, path: string) => editor(page).locator(`[data-option="${path}"]`);
const stateCode = (page: Page) => page.getByLabel("State code");
const raw = (page: Page) => page.getByLabel("Raw table text");

async function openTab(page: Page, name: string) {
  const tab = editor(page).getByRole("tab", { name, exact: true });
  await expect(tab).toBeVisible({ timeout: 90_000 });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
}

/** Picks the option whose label contains `text` (labels can be indented, as in the game's dropdowns). */
async function selectByText(select: Locator, text: string | RegExp) {
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  expect(value).not.toBeNull();
  await select.selectOption(value!);
}

async function iconSize(page: Page): Promise<number> {
  const icon = page.getByTestId("aura-preview").locator('[data-region-type="icon"] img');
  await expect(icon).toBeVisible({ timeout: 60_000 });
  const screen = page.getByTestId("mock-screen");
  const uiHeight = Number(await screen.getAttribute("data-ui-height"));
  return Math.round(((await icon.boundingBox())!.width * uiHeight) / (await screen.boundingBox())!.height);
}

test("the editor has the game's tabs", async ({ page }) => {
  await page.goto(`/?w=${uniqueId("opts")}`);
  await openTab(page, "Display");
  await expect(editor(page).getByRole("tab")).toHaveText([
    "Display",
    "Trigger",
    "Conditions",
    "Actions",
    "Animations",
    "Load",
    "Custom Options",
    "Information",
  ]);
});

test("changing the width in the Display tab resizes the preview and changes the state code", async ({ page }) => {
  await page.goto(`/?w=${uniqueId("opts")}`);
  await openTab(page, "Display");
  await expect.poll(() => iconSize(page), { timeout: 60_000 }).toBe(64);
  const before = await stateCode(page).inputValue();

  // "Position and Size Settings" starts collapsed, as in the game.
  await editor(page).getByRole("button", { name: "Position and Size Settings" }).click();
  const width = option(page, "position.width").locator('input[type="number"]');
  await expect(width).toHaveValue("64", { timeout: 30_000 });
  await width.fill("100");
  await width.press("Enter");

  await expect.poll(() => iconSize(page), { timeout: 30_000 }).toBe(100);
  await expect(stateCode(page)).not.toHaveValue(before);
  await expect(raw(page)).toHaveValue(/\n {2}width = 100,\n/);
  await expect(width).toHaveValue("100");
});

test("enabling Remaining Time in the Trigger tab updates the checks", async ({ page }) => {
  await page.goto(`/?w=${uniqueId("opts")}`);
  const panel = page.getByTestId("validation-panel");
  await expect(panel).toHaveAttribute("data-state", "done", { timeout: 90_000 });
  const before = await panel.locator("li").count();

  await openTab(page, "Trigger");
  const useRem = option(page, "trigger.1.secretAura.useRem").getByRole("checkbox");
  await expect(useRem).not.toBeChecked();
  await expect(option(page, "trigger.1.secretAura.rem")).toHaveCount(0); // hidden until enabled
  await useRem.check();

  await expect(useRem).toBeChecked();
  await expect(option(page, "trigger.1.secretAura.rem").locator("input")).toBeVisible();
  await expect(raw(page)).toHaveValue(/secretUseRem = true/);
  await expect(panel).toHaveAttribute("data-state", "done", { timeout: 30_000 });
  await expect.poll(() => panel.locator("li").count(), { timeout: 30_000 }).not.toBe(before);
});

test("adds a glow and a condition that shows it, with the addon's own buttons", async ({ page }) => {
  await page.goto(`/?w=${uniqueId("opts")}`);
  await openTab(page, "Display");
  await editor(page).getByRole("button", { name: "Add Glow", exact: true }).click();
  await expect(raw(page)).toHaveValue(/type = "subglow"/, { timeout: 30_000 });

  await openTab(page, "Conditions");
  await editor(page).getByRole("button", { name: "Add Condition", exact: true }).click();
  const check = option(page, "condition1@if").locator("select");
  await expect(check).toBeVisible({ timeout: 30_000 });
  await selectByText(check, "Seconds left");
  const value = option(page, "condition1@_value").locator("input");
  await expect(value).toBeVisible();
  await value.fill("5");
  await value.press("Enter");

  const property = option(page, "condition1property1").locator("select");
  await expect(property.locator("option", { hasText: /Glow 1.*Visibility/ })).toHaveCount(1, { timeout: 30_000 });
  await selectByText(property, /Glow 1.*Visibility/);
  const show = option(page, "condition1value1").getByRole("checkbox");
  await expect(show).toBeVisible();
  await show.check();

  await expect(raw(page)).toHaveValue(/property = "sub\.2\.glow"/);
  await expect(raw(page)).toHaveValue(/variable = "faAuraRemaining"/);
  await expect(page.getByTestId("validation-panel")).toHaveAttribute("data-combat-status", "ok", { timeout: 30_000 });
});
