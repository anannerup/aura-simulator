import { expect, test, type Page } from "@playwright/test";
import { ownWorkspacePage } from "../support/e2e-workspace";

/** The window box, the icon box and the icon's size as a fraction of the window height. */
async function measure(page: Page) {
  const screen = (await page.getByTestId("mock-screen").boundingBox())!;
  const icon = (await page.getByTestId("aura-preview").locator('[data-region-type="icon"] img').boundingBox())!;
  return {
    screen,
    icon,
    aspect: screen.width / screen.height,
    iconFraction: icon.height / screen.height,
    centreDx: icon.x + icon.width / 2 - (screen.x + screen.width / 2),
    centreDy: icon.y + icon.height / 2 - (screen.y + screen.height / 2),
  };
}

async function setNumber(page: Page, label: string, value: number) {
  const input = page.getByRole("spinbutton", { name: label, exact: true });
  await input.fill(String(value));
  await input.press("Enter");
}

/** The screen settings live in a popover behind the game screen toolbar's settings button. */
const openSettings = (page: Page) => page.getByRole("button", { name: "Screen settings" }).click();

/** A PNG "screenshot" of the given size, drawn by the browser. */
async function screenshotPng(page: Page, width: number, height: number) {
  const dataUrl = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#3a6";
      ctx.fillRect(0, 0, w, h);
      return canvas.toDataURL("image/png");
    },
    [width, height],
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

test("resolution and UI scale resize and move the aura like the game", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.goto(ownWorkspacePage("screen"));
  await expect(page.getByTestId("aura-preview")).toBeVisible({ timeout: 60_000 });

  // Defaults from the user's game: 2560x1440 with ElvUI's UI scale 0.6 → UIParent is 768/0.6 = 1280 units high.
  let m = await measure(page);
  expect(m.aspect).toBeCloseTo(2560 / 1440, 2);
  expect(m.iconFraction).toBeCloseTo(64 / 1280, 3);
  expect(Math.abs(m.centreDx)).toBeLessThan(1);
  expect(Math.abs(m.centreDy)).toBeLessThan(1);

  // UI scale off: UIParent is 768 units high, so the icon takes 64/768 of the window.
  await openSettings(page);
  await page.getByRole("combobox", { name: "Resolution" }).selectOption("1920x1080");
  await page.getByRole("checkbox", { name: "Use UI scale" }).uncheck();
  m = await measure(page);
  expect(m.aspect).toBeCloseTo(16 / 9, 2);
  expect(m.iconFraction).toBeCloseTo(64 / 768, 3);
  await expect(page.getByTestId("ui-parent-size")).toContainText("UIParent 1365 × 768 units");

  // A custom 4:3 window with UI scale 0.8: UIParent is 960 units high.
  const before = m.icon;
  await setNumber(page, "Width", 1024);
  await setNumber(page, "Height", 768);
  await page.getByRole("checkbox", { name: "Use UI scale" }).check();
  await setNumber(page, "UI scale", 0.8);
  m = await measure(page);
  expect(m.aspect).toBeCloseTo(4 / 3, 2);
  expect(m.iconFraction).toBeCloseTo((64 * 0.8) / 768, 3);
  expect(Math.abs(m.centreDx)).toBeLessThan(1);
  expect(m.icon.height).not.toBeCloseTo(before.height, 0);
  expect(m.icon.x).not.toBeCloseTo(before.x, 0);
  await expect(page.getByRole("combobox", { name: "Resolution" })).toHaveValue("custom");

  // Settings survive a reload.
  await page.reload();
  await expect(page.getByTestId("aura-preview")).toBeVisible({ timeout: 60_000 });
  m = await measure(page);
  expect(m.aspect).toBeCloseTo(4 / 3, 2);
  expect(m.iconFraction).toBeCloseTo((64 * 0.8) / 768, 3);

  // Grid and centre lines.
  await expect(page.getByTestId("screen-grid")).toHaveCount(0);
  await openSettings(page);
  await page.getByRole("checkbox", { name: "Grid and centre lines" }).check();
  await expect(page.getByTestId("screen-grid")).toBeVisible();
});

test("a screenshot shows behind the screen, is kept locally and can be hidden", async ({ page }) => {
  await page.goto(ownWorkspacePage("screen"));
  await expect(page.getByTestId("aura-preview")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("screen-background")).toHaveCount(0);

  await page.getByLabel("Screenshot").setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: await screenshotPng(page, 1600, 900) });
  const background = page.getByTestId("screen-background");
  await expect(background).toBeVisible();
  const screen = (await page.getByTestId("mock-screen").boundingBox())!;
  const bg = (await background.boundingBox())!;
  // The screenshot lies in the scaled UI layer (so additive art blends onto it): equal up to float rounding.
  for (const key of ["x", "y", "width", "height"] as const) expect(bg[key]).toBeCloseTo(screen[key], 1);

  // The screenshot is 1600x900, not the window's resolution: offer to switch to it, so it maps 1:1.
  await openSettings(page);
  await page.getByRole("button", { name: "Use 1600 × 900" }).click();
  await expect(page.getByTestId("mock-screen")).toHaveAttribute("data-window", "1600x900");
  await expect(page.getByRole("button", { name: "Use 1600 × 900" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("screen-background")).toBeVisible({ timeout: 60_000 });

  await openSettings(page);
  await page.getByRole("checkbox", { name: "Show screenshot" }).uncheck();
  await expect(page.getByTestId("screen-background")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Show screenshot" }).check();
  await page.getByRole("button", { name: "Remove screenshot" }).click();
  await expect(page.getByTestId("screen-background")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("aura-preview")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("screen-background")).toHaveCount(0);
});
