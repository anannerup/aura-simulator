import { expect, test, type Page } from "@playwright/test";
import { Blp, BlpImage, BLP_COLOR_FORMAT, BLP_IMAGE_FORMAT } from "@wowserhq/format";

// Blizzard textures are never committed or fetched in tests: wago.tools answers with a
// synthetic BLP of the requested size (orange, alpha ramp), the icon with a 1×1 GIF.
const SIZES: Record<string, [number, number]> = {
  "457293": [128, 256],
  "457294": [256, 256],
  "136264": [256, 256],
  "5199404": [2048, 1024],
};

function syntheticBlp(width: number, height: number): Buffer {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([255, 160, 40, (i * 7) % 256], i * 4);
  const blp = new Blp();
  blp.setImage(new BlpImage(width, height, data, BLP_IMAGE_FORMAT.IMAGE_ABGR8888), BLP_COLOR_FORMAT.COLOR_RAW);
  return Buffer.from(blp.save() as Uint8Array);
}

const GIF = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

async function stubNetwork(page: Page) {
  await page.route("https://wago.tools/api/casc/*", (route) => {
    const id = route.request().url().split("/").pop()!;
    const [w, h] = SIZES[id] ?? [8, 8];
    return route.fulfill({ status: 200, body: syntheticBlp(w, h), headers: { "access-control-allow-origin": "*" } });
  });
  await page.route("https://wow.zamimg.com/**", (route) => route.fulfill({ status: 200, body: GIF, contentType: "image/gif" }));
}

/** Reads a style property of the first matching element, twice, some time apart. */
async function changesOverTime(page: Page, selector: string, read: (el: HTMLElement) => string) {
  const loc = page.locator(selector).first();
  const a = await loc.evaluate(read);
  await page.waitForTimeout(400);
  const b = await loc.evaluate(read);
  return { a, b };
}

test.beforeEach(async ({ page }) => {
  await stubNetwork(page);
  await page.goto("/dev/glows");
});

test("button overlay glow loads its textures and animates the ants", async ({ page }) => {
  const cell = '[data-testid="glow-buttonOverlay"]';
  await expect(page.locator(`${cell} [data-glow-part="frame"]`).first()).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  const ants = page.locator(`${cell} [data-glow-part="ants"]`).first();
  await expect(ants).toHaveCSS("background-image", /url\("?blob:/);
  // after the 0.5 s intro the outer glow and ants rest at full alpha
  await expect(ants).toHaveCSS("opacity", "1");
  await expect(page.locator(`${cell} [data-glow-part="outerGlow"]`).first()).toHaveCSS("opacity", "1");
  await expect(page.locator(`${cell} [data-glow-part="spark"]`).first()).toHaveCSS("opacity", "0");
  const { a, b } = await changesOverTime(page, `${cell} [data-glow-part="ants"]`, (el) => el.style.backgroundPosition);
  expect(a).not.toBe(b);
});

test("pixel glow lines move round the frame", async ({ page }) => {
  const cell = '[data-testid="glow-Pixel"]';
  await expect(page.locator(`${cell} [data-glow-part="line"]`)).toHaveCount(16); // 8 lines × (icon + bar)
  const { a, b } = await changesOverTime(page, `${cell} [data-glow-part="line"]`, (el) => `${el.style.left},${el.style.top},${el.style.width},${el.style.height}`);
  expect(a).not.toBe(b);
});

test("autocast shine sparkles orbit with the shine texture", async ({ page }) => {
  const cell = '[data-testid="glow-ACShine"]';
  await expect(page.locator(`${cell} [data-glow-part="sparkle"]`)).toHaveCount(64); // 4 rings × 8 × 2
  await expect(page.locator(`${cell} [data-glow-part="frame"]`).first()).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.locator(`${cell} [data-glow-part="sparkle"]`).first()).toHaveCSS("mix-blend-mode", "plus-lighter");
  const { a, b } = await changesOverTime(page, `${cell} [data-glow-part="sparkle"]`, (el) => `${el.style.left},${el.style.top}`);
  expect(a).not.toBe(b);
});

test("proc glow plays its flipbook", async ({ page }) => {
  const cell = '[data-testid="glow-Proc"]';
  await expect(page.locator(`${cell} [data-glow-part="frame"]`).first()).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  // the demo enables the start animation; after 0.7 s the loop takes over
  await expect(page.locator(`${cell} [data-glow-part="procLoop"]`).first()).toHaveCSS("opacity", "1");
  const { a, b } = await changesOverTime(page, `${cell} [data-glow-part="procLoop"]`, (el) => el.dataset.frame ?? "");
  expect(a).not.toBe(b);
});

test("options and visibility are applied", async ({ page }) => {
  const cell = '[data-testid="glow-Pixel"]';
  // textures only become ready on the client, so this also waits for hydration
  await expect(page.locator('[data-testid="glow-ACShine"] [data-glow-part="frame"]').first()).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await page.locator('input[name="glowLines"]').fill("3");
  await expect(page.locator(`${cell} [data-glow-part="line"]`)).toHaveCount(6);
  await page.getByLabel("Border (Pixel)").check();
  await expect(page.locator(`${cell} [data-glow-part="border"]`)).toHaveCount(2);
  await page.getByLabel("Use Custom Color").check();
  await expect(page.locator(`${cell} [data-glow-part="line"]`).first()).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await page.getByLabel("Glow (visible)").uncheck();
  await expect(page.locator(`${cell} [data-glow-part="line"]`)).toHaveCount(0);
  // the button glow fades out (animOut, 0.4 s) and ends hidden
  await expect(page.locator('[data-testid="glow-buttonOverlay"] [data-glow-part="ants"]').first()).toHaveCSS("opacity", "0");
});
