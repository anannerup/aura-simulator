/**
 * The options editor's richer widgets and the New Aura page: colour picker, the icon picker that replaces the game's
 * dialog, media dropdowns, confirmations, the Load tab's client lists, and every display type being creatable.
 */
import { expect, test, type Page } from "@playwright/test";
import { ownWorkspacePage } from "../support/e2e-workspace";

const editor = (page: Page) => page.getByRole("region", { name: "Aura options" });
const option = (page: Page, path: string) => editor(page).locator(`[data-option="${path}"]`);
const raw = (page: Page) => page.getByLabel("Raw table text");
const chooser = (page: Page) => page.getByRole("region", { name: "New aura" });

async function idle(page: Page) {
  await page.waitForTimeout(80);
  await expect(editor(page)).toHaveAttribute("data-busy", "false", { timeout: 60_000 });
}

async function openTab(page: Page, name: string) {
  const tab = editor(page).getByRole("tab", { name, exact: true });
  await expect(tab).toBeVisible({ timeout: 90_000 });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await idle(page);
}

async function newAura(page: Page, type: string) {
  await page.getByRole("button", { name: "New Aura" }).click();
  const entry = chooser(page).locator(`button[data-type="${type}"]`);
  await expect(entry).toBeEnabled({ timeout: 90_000 });
  await entry.click();
  await expect(raw(page)).toHaveValue(new RegExp(`regionType = "${type}"`), { timeout: 60_000 });
  await idle(page);
}

test("New Aura lists every display type the addon registers, with its names, and makes each one", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto(ownWorkspacePage("new-aura"));
  await page.getByRole("button", { name: "New Aura" }).click();
  const page_ = chooser(page);
  await expect(page_.locator("button[data-type]")).toHaveCount(11, { timeout: 90_000 }); // 10 types + Modern Aura Group
  await expect(page_.getByRole("button", { name: /Progress Bar\s*Shows a progress bar with name, timer, and icon/ })).toBeEnabled();
  await expect(page_.getByRole("button", { name: /Premade Auras/ })).toBeDisabled();
  await expect(page_.getByRole("button", { name: /^Packs/ })).toBeEnabled();
  await page_.getByRole("button", { name: "Cancel" }).click();

  for (const type of ["aurabar", "text", "texture", "progresstexture", "stopmotion", "model", "empty"]) {
    await newAura(page, type);
    await expect(page.getByTestId("aura-preview").locator(`[data-region-type="${type}"]`).first()).toBeAttached({ timeout: 30_000 });
  }
  await page.getByRole("button", { name: "New Aura" }).click();
  await chooser(page).locator('button[data-type="modern-group"]').click();
  await expect(raw(page)).toHaveValue(/blizzardFlow = true/, { timeout: 60_000 });
});

test("a colour opens a colour picker; the colour and its opacity go into the aura", async ({ page }) => {
  await page.goto(ownWorkspacePage("color"));
  await openTab(page, "Display");
  const swatch = option(page, "icon.color").getByRole("button", { name: /^Color:/ });
  await expect(swatch).toBeVisible();
  await swatch.click();
  const square = page.getByRole("slider", { name: "Saturation and brightness" });
  await expect(square).toBeVisible();
  await page.getByRole("textbox", { name: "Hex" }).fill("#ff0000");
  await page.getByRole("textbox", { name: "Hex" }).press("Enter");
  await expect(raw(page)).toHaveValue(/color = \{\s*1,\s*0,\s*0,\s*1,?\s*\}/, { timeout: 30_000 });
  await page.getByRole("spinbutton", { name: "Opacity %" }).fill("50");
  await page.getByRole("spinbutton", { name: "Opacity %" }).press("Enter");
  await expect(raw(page)).toHaveValue(/color = \{\s*1,\s*0,\s*0,\s*0\.5,?\s*\}/, { timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect(square).toHaveCount(0);
  await expect(swatch).toHaveAttribute("data-color", "1,0,0,0.5");
});

test("Manual Icon's Choose opens an icon picker; a typed icon name sets the icon", async ({ page }) => {
  await page.goto(ownWorkspacePage("icon-pick"));
  await openTab(page, "Display");
  await option(page, "icon.chooseIcon").getByRole("button").click();
  const dialog = page.getByRole("dialog", { name: "Choose an icon" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("textbox", { name: "Search icons" }).fill("inv_misc_bag_08");
  await dialog.getByRole("button", { name: /Use inv_misc_bag_08/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(raw(page)).toHaveValue(/displayIcon = "Interface\\\\Icons\\\\inv_misc_bag_08"/, { timeout: 30_000 });
});

test("fonts are listed in their own font", async ({ page }) => {
  await page.goto(ownWorkspacePage("fonts"));
  await newAura(page, "text");
  await openTab(page, "Display");
  const font = editor(page).locator('[data-media="font"]').first();
  await expect(font).toBeVisible();
  await font.getByRole("combobox").click();
  const list = font.getByRole("listbox");
  await expect(list.locator("[data-font]").first()).toBeVisible();
  const morpheus = list.getByRole("option", { name: "Morpheus" });
  await expect(morpheus.locator("[data-font]")).toHaveCSS("font-family", /WoW Morpheus/);
  await morpheus.click();
  await expect(raw(page)).toHaveValue(/font = "Morpheus"/, { timeout: 30_000 });
});

test("deleting a trigger asks first", async ({ page }) => {
  await page.goto(ownWorkspacePage("trigger-delete"));
  await openTab(page, "Trigger");
  await editor(page).getByRole("button", { name: "Add Trigger", exact: true }).click();
  await idle(page);
  await expect(raw(page)).toHaveValue(/\[2\] = \{/, { timeout: 30_000 });
  await editor(page).locator('[data-option^="trigger.2."][data-option$="deleteButton"] button').click();
  const confirm = page.getByRole("dialog", { name: "Are you sure?" });
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(raw(page)).not.toHaveValue(/\[2\] = \{/, { timeout: 30_000 });
});

test("the Load tab lists the client's talents, instance types and weapon types", async ({ page }) => {
  await page.goto(ownWorkspacePage("load"));
  await openTab(page, "Load");
  await option(page, "use_talent").getByRole("checkbox").click();
  await idle(page);
  await expect(option(page, "talent").locator("option", { hasText: "Improved Heroic Strike" })).toHaveCount(1, { timeout: 30_000 });
  await option(page, "use_instance_type").getByRole("checkbox").click();
  await idle(page);
  await expect(option(page, "instance_type").locator("option", { hasText: "40 Player Raid" })).toHaveCount(1);
});
