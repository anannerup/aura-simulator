import { expect, test, type Page } from "@playwright/test";
import { Blp, BlpImage, BLP_COLOR_FORMAT, BLP_IMAGE_FORMAT } from "@wowserhq/format";

// No Blizzard art in tests: wago.tools answers textures with a small synthetic BLP and fonts with 404 (the text
// falls back to a web font), the addon CDN with 404, Wowhead icons with a 1×1 GIF. Requests are recorded.
function syntheticBlp(width: number, height: number): Buffer {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([200, 200, 200, 255], i * 4);
  const blp = new Blp();
  blp.setImage(new BlpImage(width, height, data, BLP_IMAGE_FORMAT.IMAGE_ABGR8888), BLP_COLOR_FORMAT.COLOR_RAW);
  return Buffer.from(blp.save() as Uint8Array);
}
const GIF = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
const FONT_IDS = new Set(["615958", "615960", "615961", "615962"]);

async function stubNetwork(page: Page): Promise<string[]> {
  const requested: string[] = [];
  await page.route("https://wago.tools/api/casc/*", (route) => {
    const id = route.request().url().split("/").pop()!;
    requested.push(id);
    if (FONT_IDS.has(id)) return route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" } });
    return route.fulfill({ status: 200, body: syntheticBlp(16, 16), headers: { "access-control-allow-origin": "*" } });
  });
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.fulfill({ status: 404 }));
  await page.route("https://wow.zamimg.com/**", (route) => route.fulfill({ status: 200, body: GIF, contentType: "image/gif" }));
  return requested;
}

const trigger = (page: Page, n = 1) => page.getByRole("group", { name: new RegExp(`^Trigger ${n}:`) });
const region = (page: Page) => page.getByTestId("aura-preview").locator("[data-region-type]");
const width = async (page: Page, testId: string) => (await region(page).getByTestId(testId).boundingBox())!.width;

test("v1 aura 3: the target debuff bar follows the time slider, with name and time texts", async ({ page }) => {
  await stubNetwork(page);
  await page.goto("/lab?example=target-debuff-bar");
  await expect(region(page)).toHaveAttribute("data-region-type", "aurabar");
  const fg = region(page).getByTestId("bar-foreground");
  const bg = region(page).getByTestId("bar-background");
  const texts = region(page).locator('[data-subregion="subtext"]');
  await expect(bg).toHaveAttribute("data-texture", "loaded");
  await expect(texts.nth(0)).toHaveText("Corruption on target");
  await expect(texts.nth(1)).toHaveText("45.0");
  const full = await width(page, "bar-background");
  // 45 of 60 seconds left: three quarters of the bar (the icon takes the first 22 px).
  expect(Math.abs((await width(page, "bar-foreground")) - full * 0.75)).toBeLessThan(0.6);
  await expect(fg).toHaveAttribute("data-progress", "0.7500");

  await trigger(page).getByLabel("Time left").fill("15");
  await expect(fg).toHaveAttribute("data-progress", "0.2500");
  expect(Math.abs((await width(page, "bar-foreground")) - full * 0.25)).toBeLessThan(0.6);
  await expect(texts.nth(1)).toHaveText("15.0");
  // The fill grows from the left: it starts where the bar does.
  expect((await fg.boundingBox())!.x).toBeCloseTo((await bg.boundingBox())!.x, 0);

  // The Aura (Modern) duration text rule (< 5 s: red) keeps working in combat.
  await page.getByRole("switch", { name: "In combat" }).check();
  await trigger(page).getByLabel("Time left").fill("3");
  await expect(texts.nth(1)).toHaveCSS("color", "rgb(255, 51, 51)");
  await expect(page.getByTestId("frozen-marker")).toHaveCount(0);

  await page.getByLabel("Target exists").uncheck();
  await expect(region(page)).toHaveCount(0);
});

test("a vertical bar grows from the bottom; its spark sits on the edge", async ({ page }) => {
  await stubNetwork(page);
  await page.goto("/lab?example=vertical-bar");
  await expect(region(page).locator("[data-orientation]")).toHaveAttribute("data-orientation", "VERTICAL_INVERSE");
  // Textures load after hydration: wait for it before using the controls.
  await expect(region(page).getByTestId("bar-background")).toHaveAttribute("data-texture", "loaded");
  await trigger(page).getByLabel("Time left").fill("30");
  await expect(region(page).getByTestId("bar-foreground")).toHaveAttribute("data-progress", "0.5000");
  const fg = (await region(page).getByTestId("bar-foreground").boundingBox())!;
  const bg = (await region(page).getByTestId("bar-background").boundingBox())!;
  expect(fg.width).toBeCloseTo(bg.width, 1);
  expect(fg.height).toBeCloseTo(bg.height / 2, 0);
  expect(fg.y + fg.height).toBeCloseTo(bg.y + bg.height, 0);
  const spark = (await region(page).getByTestId("bar-spark").boundingBox())!;
  expect(spark.y + spark.height / 2).toBeCloseTo(fg.y, 0);
  // The icon sits on top (icon_side LEFT on a vertical bar).
  expect((await region(page).getByTestId("bar-icon").boundingBox())!.y).toBeLessThan(bg.y);
});

test("ticks, border and a Pixel glow switched on by a condition", async ({ page }) => {
  await stubNetwork(page);
  await page.goto("/lab?example=ticked-bar");
  const ticks = region(page).locator('[data-subregion="subtick"] [data-tick]');
  await expect(region(page).getByTestId("bar-background")).toHaveAttribute("data-texture", "loaded");
  await expect(ticks).toHaveCount(2);
  const bar = (await region(page).getByTestId("bar-background").boundingBox())!;
  const tick = (await ticks.nth(0).boundingBox())!;
  // AtValue 10 on a 60 s timer: a sixth of the way along the bar.
  expect(tick.x + tick.width / 2 - bar.x).toBeCloseTo(bar.width / 6, 0);
  expect(tick.height).toBeCloseTo(bar.height, 0);
  await expect(region(page).locator('[data-subregion="subborder"] [data-piece]')).toHaveCount(8);

  const glow = region(page).locator('[data-subregion="subglow"]');
  await expect(glow).toHaveAttribute("data-glow", "off");
  await expect(glow.locator('[data-glow-part="line"]')).toHaveCount(0);
  await trigger(page).getByLabel("Time left").fill("5");
  await expect(glow).toHaveAttribute("data-glow", "on");
  await expect(glow.locator('[data-glow-type="Pixel"] [data-glow-part="line"]')).toHaveCount(8);
  // The bar glow covers the whole region (anchor_area "bar").
  const area = (await glow.boundingBox())!;
  const whole = (await region(page).boundingBox())!;
  expect(area.width).toBeCloseTo(whole.width, 0);
});

test("v1 auras 1a and 1b glow in the preview when their condition holds", async ({ page }) => {
  await stubNetwork(page);
  await page.goto("/lab?example=buff-running-low");
  const glow = region(page).locator('[data-subregion="subglow"]');
  await expect(glow).toHaveAttribute("data-glow", "on");
  await expect(glow.locator('[data-glow-type="buttonOverlay"] [data-glow-part="frame"]')).toHaveAttribute("data-ready", "true");
  await expect(glow.locator('[data-glow-part="ants"]')).toHaveCSS("opacity", "1", { timeout: 5000 });

  await page.goto("/lab?example=buff-missing");
  await trigger(page).getByLabel("Aura present").uncheck();
  const missingGlow = region(page).locator('[data-subregion="subglow"]');
  await expect(missingGlow).toHaveAttribute("data-glow", "on");
  await expect(missingGlow.locator('[data-glow-part="ants"]')).toHaveCSS("opacity", "1", { timeout: 5000 });
});

test("a text region renders its format codes in the game font", async ({ page }) => {
  const requested = await stubNetwork(page);
  await page.goto("/lab?example=cooldown-text");
  const text = page.getByTestId("text-region");
  await expect(text).toHaveText("Fire Blast: 45.0");
  await expect(text).toHaveCSS("color", "rgb(153, 153, 153)");
  await expect(text).toHaveCSS("font-size", "24px");
  await expect(text).toHaveCSS("font-family", /^"WoW Friz Quadrata TT"/);
  // Friz Quadrata is requested from wago.tools by FileDataID; the stub refuses it, so the fallback is used.
  await expect.poll(() => requested.includes("615960")).toBe(true);
  await expect(text).toHaveAttribute("data-font", "failed");

  await trigger(page).getByLabel("On cooldown").uncheck();
  await expect(text).toHaveCSS("color", "rgb(255, 209, 0)");
  await expect(text).toHaveText(/^Fire Blast:\s*$/);
});
