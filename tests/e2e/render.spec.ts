/**
 * A picture of an aura as the game draws it (working from a user's screenshot): the render page
 * (`/<game>/render?w=&aura=`), only the aura, cropped to its bounds, and the screenshot endpoint
 * (`GET /api/<game>/workspaces/<id>/screenshot.png`) that takes its picture in a headless browser.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { tbcBuffUnderThreeMinutes, tbcCooldownIcon, tbcV1Group } from "@/games/tbc/examples";

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function push(request: APIRequestContext, workspace: string, body: unknown) {
  const res = await request.post(`/api/tbc/workspaces/${workspace}/aura?validate=false`, { data: body });
  expect(res.status(), await res.text()).toBe(200);
}

/** A PNG's size, from its IHDR chunk. */
function pngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** The RGBA of one pixel of a PNG, decoded in the browser. */
async function pixel(page: Page, png: Buffer, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    async ({ b64, x, y }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(x, y, 1, 1).data);
    },
    { b64: png.toString("base64"), x, y },
  );
}

/** How much redder than green the reddest pixel of a rectangle of a PNG is (x and y as inclusive ranges). */
async function reddest(page: Page, png: Buffer, xs: [number, number], ys: [number, number]): Promise<number> {
  return page.evaluate(
    async ({ b64, xs, ys }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(xs[0], ys[0], xs[1] - xs[0] + 1, ys[1] - ys[0] + 1).data;
      let best = -255;
      for (let i = 0; i < data.length; i += 4) best = Math.max(best, data[i] - data[i + 1]);
      return best;
    },
    { b64: png.toString("base64"), xs, ys },
  );
}

async function screenshot(request: APIRequestContext, workspace: string, query: Record<string, string> = {}) {
  const res = await request.get(`/api/tbc/workspaces/${workspace}/screenshot.png?${new URLSearchParams(query)}`, { timeout: 120_000 });
  expect(res.status(), res.status() === 200 ? "" : await res.text()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  return res.body();
}

test("the render page draws only the aura, cropped to its bounds, and says when it is ready", async ({ page, request }) => {
  test.setTimeout(180_000);
  const workspace = uniqueId("render-page");
  await push(request, workspace, tbcV1Group);

  // A child of the group: drawn where the group puts it, cropped to its 64 × 64 icon, at twice the size.
  await page.goto(`/tbc/render?w=${workspace}&aura=${encodeURIComponent("Fire Blast cooldown")}&scale=2`);
  const picture = page.getByTestId("aura-render");
  await expect(picture).toHaveAttribute("data-ready", "true", { timeout: 90_000 });
  await expect(picture).toHaveAttribute("data-width", "128");
  await expect(picture).toHaveAttribute("data-height", "128");
  await expect(picture.locator('[data-aura-id="Fire Blast cooldown"]')).toBeVisible();
  // Nothing but the aura: no selection outline, no stand-ins, no window, no page background.
  await expect(page.getByTestId("selection-box")).toHaveCount(0);
  await expect(page.getByTestId("anchor-stand-in")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");

  // The whole group: its shown children's bounds (icons at x 0 and 72, the 200-wide bar 56 below at x 36).
  await page.goto(`/tbc/render?w=${workspace}&aura=${encodeURIComponent("TBC v1 auras")}`);
  await expect(picture).toHaveAttribute("data-ready", "true", { timeout: 90_000 });
  await expect(picture).toHaveAttribute("data-width", "200");
  await expect(picture).toHaveAttribute("data-height", "98");

  // What can't be drawn says why.
  await page.goto(`/tbc/render?w=${workspace}&aura=nope`);
  await expect(page.locator("[data-render-error]")).toContainText('has an aura "nope"');
});

test("the screenshot endpoint answers a PNG of the aura at the asked scale, transparent around it", async ({ page, request }) => {
  test.setTimeout(240_000);
  const workspace = uniqueId("render-png");
  await push(request, workspace, { aura: tbcCooldownIcon });

  expect(pngSize(await screenshot(request, workspace))).toEqual({ width: 64, height: 64 });
  expect(pngSize(await screenshot(request, workspace, { scale: "1.125" }))).toEqual({ width: 72, height: 72 });
  const padded = await screenshot(request, workspace, { padding: "8" });
  expect(pngSize(padded)).toEqual({ width: 80, height: 80 });
  expect((await pixel(page, padded, 1, 1))[3]).toBe(0);
  expect((await pixel(page, padded, 40, 40))[3]).toBe(255);
  const dark = await screenshot(request, workspace, { padding: "8", background: "203040" });
  expect(await pixel(page, dark, 1, 1)).toEqual([0x20, 0x30, 0x40, 255]);

  const bad = await request.get(`/api/tbc/workspaces/${workspace}/screenshot.png?scale=0`);
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toMatch(/scale/);
  const none = await request.get(`/api/tbc/workspaces/${uniqueId("render-empty")}/screenshot.png`);
  expect(none.status()).toBe(404);
});

test("two situations give two different pictures", async ({ request }) => {
  test.setTimeout(240_000);
  const workspace = uniqueId("render-situations");
  await push(request, workspace, { aura: tbcBuffUnderThreeMinutes });
  const situation = (remaining: number) => JSON.stringify({ triggers: { "1": { remaining } } });

  // Two minutes left: the plain icon. Five seconds left: glowing, its time text red.
  const calm = await screenshot(request, workspace, { situation: situation(120), padding: "16" });
  const urgent = await screenshot(request, workspace, { situation: situation(5), padding: "16" });
  expect(pngSize(calm)).toEqual(pngSize(urgent));
  expect(calm.equals(urgent)).toBe(false);

  // Without one, the workspace's situation (as an agent set it) is drawn.
  const set = await request.put(`/api/tbc/workspaces/${workspace}/situation`, { data: { triggers: { "1": { remaining: 5 } } } });
  expect(set.status()).toBe(200);
  expect((await screenshot(request, workspace, { padding: "16" })).equals(urgent)).toBe(true);
});

test("a 1-unit border draws all four sides at any scale, snapped to whole pixels", async ({ page, request }) => {
  test.setTimeout(240_000);
  const workspace = uniqueId("render-border");
  // A red 1-unit border 2 units outside the 64-unit icon: nothing else is drawn where it is.
  const border = { type: "subborder", border_visible: true, border_edge: "Square Full White", border_size: 1, border_offset: 2, border_color: [1, 0, 0, 1] };
  await push(request, workspace, { aura: { ...tbcCooldownIcon, subRegions: [{ type: "subbackground" }, border] } });
  for (const scale of [1, 1.40625, 1.5, 2]) {
    const png = await screenshot(request, workspace, { scale: String(scale), padding: "4", background: "000000" });
    const { width, height } = pngSize(png);
    // The picture is cropped to the icon plus 4 units of padding: the border is the 3rd unit in from each side.
    const inFrom = (size: number, start: boolean): [number, number] => {
      const [a, b] = [Math.floor(2 * scale) - 1, Math.ceil(3 * scale)];
      return start ? [a, b] : [size - 1 - b, size - 1 - a];
    };
    const middle = (size: number): [number, number] => [Math.floor(size / 2) - 2, Math.floor(size / 2) + 2];
    expect(await reddest(page, png, inFrom(width, true), middle(height)), `left at scale ${scale}`).toBeGreaterThan(200);
    expect(await reddest(page, png, inFrom(width, false), middle(height)), `right at scale ${scale}`).toBeGreaterThan(200);
    expect(await reddest(page, png, middle(width), inFrom(height, true)), `top at scale ${scale}`).toBeGreaterThan(200);
    expect(await reddest(page, png, middle(width), inFrom(height, false)), `bottom at scale ${scale}`).toBeGreaterThan(200);
  }
});
