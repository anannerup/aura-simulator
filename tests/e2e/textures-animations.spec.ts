import { expect, test, type Page } from "@playwright/test";
import { Blp, BlpImage, BLP_COLOR_FORMAT, BLP_IMAGE_FORMAT } from "@wowserhq/format";

// No network: wago.tools and the addon CDN answer every texture with a small synthetic BLP (the decoder reads the
// format from the bytes, so .tga URLs get it too), Wowhead icons with a 1×1 GIF.
function syntheticBlp(width: number, height: number): Buffer {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([200, 200, 200, 255], i * 4);
  const blp = new Blp();
  blp.setImage(new BlpImage(width, height, data, BLP_IMAGE_FORMAT.IMAGE_ABGR8888), BLP_COLOR_FORMAT.COLOR_RAW);
  return Buffer.from(blp.save() as Uint8Array);
}
const GIF = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
const FONT_IDS = new Set(["615958", "615960", "615961", "615962"]);

async function stubNetwork(page: Page) {
  const blp = syntheticBlp(16, 16);
  await page.route("https://wago.tools/api/casc/*", (route) => {
    const id = route.request().url().split("/").pop()!;
    if (FONT_IDS.has(id)) return route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" } });
    return route.fulfill({ status: 200, body: blp, headers: { "access-control-allow-origin": "*" } });
  });
  await page.route("https://cdn.jsdelivr.net/**", (route) =>
    /\.(blp|tga)$/i.test(route.request().url())
      ? route.fulfill({ status: 200, body: blp, headers: { "access-control-allow-origin": "*" } })
      : route.fulfill({ status: 404 }),
  );
  await page.route("https://wow.zamimg.com/**", (route) => route.fulfill({ status: 200, body: GIF, contentType: "image/gif" }));
}

const region = (page: Page) => page.getByTestId("aura-preview").locator("[data-region-type]");
const trigger = (page: Page, n = 1) => page.getByRole("group", { name: new RegExp(`^Trigger ${n}:`) });

test.beforeEach(async ({ page }) => {
  await stubNetwork(page);
});

test("each new region type renders", async ({ page }) => {
  await page.goto("/lab?example=texture");
  await expect(region(page)).toHaveAttribute("data-region-type", "texture");
  await expect(region(page).getByTestId("texture-main")).toHaveAttribute("data-texture", "loaded");
  await expect(region(page).getByTestId("texture-main")).toHaveAttribute("data-rotation", "30");

  await page.goto("/lab?example=progress-circular");
  await expect(region(page)).toHaveAttribute("data-region-type", "progresstexture");
  await expect(region(page).getByTestId("progress-foreground")).toHaveAttribute("data-texture", "loaded");
  await expect(region(page).getByTestId("progress-background")).toBeAttached();

  await page.goto("/lab?example=stop-motion");
  await expect(region(page)).toHaveAttribute("data-region-type", "stopmotion");
  await expect(region(page).getByTestId("stopmotion-foreground")).toHaveAttribute("data-texture", "loaded");

  await page.goto("/lab?example=model");
  await expect(region(page)).toHaveAttribute("data-region-type", "model");
  await expect(region(page).getByTestId("model-placeholder")).toContainText("Model file 122968");

  await page.goto("/lab?example=empty-elements");
  await expect(region(page)).toHaveAttribute("data-region-type", "empty");
  for (const type of ["subtexture", "subcirculartexture", "sublineartexture", "substopmotion", "submodel", "subtext"]) {
    await expect(region(page).locator(`[data-subregion="${type}"]`)).toHaveCount(1);
  }
  await expect(region(page).locator('[data-subregion="subcirculartexture"]')).toHaveAttribute("data-angles", "0.0,270.0");
  // The linear sub-element sits under the region (point anchoring: its TOP on the region's BOTTOM, 4 lower).
  const lin = (await region(page).locator('[data-subregion="sublineartexture"]').boundingBox())!;
  const reg = (await region(page).boundingBox())!;
  expect(lin.y).toBeCloseTo(reg.y + reg.height + 4, 0);
});

test("progress textures follow the time slider (circular native, linear drawn by quads)", async ({ page }) => {
  await page.goto("/lab?example=progress-circular");
  const fg = region(page).getByTestId("progress-foreground");
  // A loaded texture means the page is hydrated (textures load in effects): only then do the controls react.
  await expect(fg).toHaveAttribute("data-texture", "loaded");
  await expect(region(page).locator("[data-native]")).toHaveAttribute("data-native", "true");
  await expect(fg).toHaveAttribute("data-progress", "0.7500");
  await expect(fg).toHaveAttribute("data-angles", "0.0,270.0");
  await trigger(page).getByLabel("Time left").fill("15");
  await expect(fg).toHaveAttribute("data-progress", "0.2500");
  await expect(fg).toHaveAttribute("data-angles", "0.0,90.0");
  // Clipped to the wedge: centre, top, the top-right corner, right.
  expect(await fg.evaluate((el) => (el as HTMLElement).style.clipPath)).toBe("polygon(50% 50%, 50% 0%, 100% 0%, 100% 50%)");

  await page.goto("/lab?example=progress-linear");
  const lfg = region(page).getByTestId("progress-foreground");
  await expect(lfg).toHaveAttribute("data-texture", "loaded");
  await expect(region(page).locator("[data-native]")).toHaveAttribute("data-native", "false");
  await expect(lfg).toHaveAttribute("data-progress", "0.7500");
  await trigger(page).getByLabel("Cooldown left").fill("30");
  await expect(lfg).toHaveAttribute("data-progress", "0.5000");
  // Slant 0.1 INSIDE: the fill's top edge runs from 0.1 to 0.1 + 0.5 · 0.9.
  expect(await lfg.evaluate((el) => (el as HTMLElement).style.clipPath)).toBe("polygon(10% 0%, 55% 0%, 45% 100%, 0% 100%)");
});

test("stop motion steps with time, or with the trigger in progress mode", async ({ page }) => {
  await page.goto("/lab?example=stop-motion");
  const fg = region(page).getByTestId("stopmotion-foreground");
  const first = Number(await fg.getAttribute("data-frame"));
  await expect.poll(async () => Number(await fg.getAttribute("data-frame")), { timeout: 3000 }).not.toBe(first);

  await page.goto("/lab?example=stop-motion-progress");
  const pfg = region(page).getByTestId("stopmotion-foreground");
  await expect(pfg).toHaveAttribute("data-texture", "loaded");
  // 45 of 60 s left: a quarter elapsed → frame floor(63 · 0.25) + 1.
  await expect(pfg).toHaveAttribute("data-frame", "16");
  await trigger(page).getByLabel("Time left").fill("15");
  await expect(pfg).toHaveAttribute("data-frame", "48");
});

test("animations: start on show, main loops, finish keeps the region until it ends, replay", async ({ page }) => {
  await page.goto("/lab?example=animated-icon");
  const r = region(page);
  // Phases advance on animation frames, i.e. once hydrated.
  await expect(r).toHaveAttribute("data-anim-phase", "main", { timeout: 5000 });

  // Hide: the finish animation plays (the region stays, fading and shrinking), then the region goes.
  await trigger(page).getByLabel("Aura present").uncheck();
  await expect(r).toHaveAttribute("data-anim-phase", "finish");
  await expect.poll(async () => Number(await r.evaluate((el) => getComputedStyle(el).opacity)), { timeout: 2000 }).toBeLessThan(0.9);
  await expect(r).toHaveCount(0, { timeout: 3000 });

  // Show: the start animation slides it in from below, then main.
  await trigger(page).getByLabel("Aura present").check();
  await expect(r).toHaveAttribute("data-anim-phase", "start");
  await expect(r).toHaveAttribute("data-anim-phase", "main", { timeout: 3000 });

  await page.getByRole("button", { name: "Replay" }).click();
  await expect(r).toHaveAttribute("data-anim-phase", "start");
});

test("a rotate animation turns a texture", async ({ page }) => {
  await page.goto("/lab?example=spinning-texture");
  const tex = region(page).getByTestId("texture-main");
  await expect(region(page)).toHaveAttribute("data-anim-phase", "main", { timeout: 3000 });
  const a = Number(await tex.getAttribute("data-rotation"));
  await expect.poll(async () => Number(await tex.getAttribute("data-rotation")), { timeout: 3000 }).not.toBe(a);
});
