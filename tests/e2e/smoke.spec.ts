import { expect, test } from "@playwright/test";

test("the page loads, previews the sample aura and copies its state code", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // Own workspace, so state pushed to "default" by other tests or agents does not leak in.
  await page.goto(`/?w=smoke-${Date.now().toString(36)}`);

  const preview = page.getByTestId("aura-preview");
  await expect(preview).toBeVisible({ timeout: 60_000 });
  const icon = preview.locator('[data-region-type="icon"] img');
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAttribute("src", /spell_holy_magicalsentry/);

  // The sample is 64x64 at the screen centre.
  const screenBox = (await preview.boundingBox())!;
  const iconBox = (await icon.boundingBox())!;
  expect(Math.round(iconBox.width)).toBe(64);
  expect(Math.round(iconBox.height)).toBe(64);
  expect(Math.round(iconBox.x + iconBox.width / 2)).toBe(Math.round(screenBox.x + screenBox.width / 2));
  expect(Math.round(iconBox.y + iconBox.height / 2)).toBe(Math.round(screenBox.y + screenBox.height / 2));

  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^!WA:2![A-Za-z0-9()]+$/);
  await expect(page.getByLabel("State code")).toHaveValue(copied);
});
