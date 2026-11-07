import { expect, test, type Page } from "@playwright/test";
import { Blp, BlpImage, BLP_COLOR_FORMAT, BLP_IMAGE_FORMAT } from "@wowserhq/format";
import type { AuraDocument } from "@/core";
import { openPushed, push } from "../support/e2e-workspace";

test.describe.configure({ timeout: 150_000 });

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

const TYPES = ["buttonOverlay", "Pixel", "ACShine", "Proc"] as const;

/** A group of four icons in a row, each with a glow element of one type, lit (or not) by the element's own setting. */
function glowGroup(glow: Record<string, unknown> = {}): { aura: AuraDocument; children: AuraDocument[] } {
  const children: AuraDocument[] = TYPES.map((glowType, i) => ({
    id: `glow-${glowType}`,
    parent: "Glows",
    regionType: "icon",
    displayIcon: 135932,
    width: 64,
    height: 64,
    anchorPoint: "CENTER",
    selfPoint: "CENTER",
    xOffset: i * 100 - 150,
    yOffset: 0,
    cooldown: false,
    subRegions: [{ type: "subglow", glow: true, glowType, glowStartAnim: true, ...glow }],
    triggers: { "[1]": { trigger: { type: "aura2", unit: "player", debuffType: "HELPFUL", useName: true, auranames: ["Arcane Intellect"] }, untrigger: {} }, activeTriggerMode: -10 },
    load: {},
    actions: { start: {}, finish: {}, init: {} },
  }));
  const aura: AuraDocument = {
    id: "Glows",
    regionType: "group",
    anchorPoint: "CENTER",
    selfPoint: "CENTER",
    xOffset: 0,
    yOffset: 0,
    controlledChildren: children.map((c) => c.id as string),
    load: {},
    actions: { start: {}, finish: {}, init: {} },
  };
  return { aura, children };
}

const cell = (type: string) => `[data-aura-id="glow-${type}"]`;

/** Reads a style property of the first matching element, twice, some time apart. */
async function changesOverTime(page: Page, selector: string, read: (el: HTMLElement) => string) {
  const loc = page.locator(selector).first();
  const a = await loc.evaluate(read);
  await page.waitForTimeout(400);
  const b = await loc.evaluate(read);
  return { a, b };
}

let workspace: string;
test.beforeEach(async ({ page }) => {
  await stubNetwork(page);
  const { aura, children } = glowGroup();
  workspace = await openPushed(page, aura, children);
});

test("button overlay glow loads its textures and animates the ants", async ({ page }) => {
  const at = cell("buttonOverlay");
  await expect(page.locator(`${at} [data-glow-part="frame"]`).first()).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  const ants = page.locator(`${at} [data-glow-part="ants"]`).first();
  await expect(ants).toHaveCSS("background-image", /url\("?blob:/);
  // after the 0.5 s intro the outer glow and ants rest at full alpha
  await expect(ants).toHaveCSS("opacity", "1");
  await expect(page.locator(`${at} [data-glow-part="outerGlow"]`).first()).toHaveCSS("opacity", "1");
  await expect(page.locator(`${at} [data-glow-part="spark"]`).first()).toHaveCSS("opacity", "0");
  const { a, b } = await changesOverTime(page, `${at} [data-glow-part="ants"]`, (el) => el.style.backgroundPosition);
  expect(a).not.toBe(b);
});

test("pixel glow lines move round the frame", async ({ page }) => {
  const at = cell("Pixel");
  await expect(page.locator(`${at} [data-glow-part="line"]`)).toHaveCount(8);
  const { a, b } = await changesOverTime(page, `${at} [data-glow-part="line"]`, (el) => `${el.style.left},${el.style.top},${el.style.width},${el.style.height}`);
  expect(a).not.toBe(b);
});

test("autocast shine sparkles orbit with the shine texture", async ({ page }) => {
  const at = cell("ACShine");
  await expect(page.locator(`${at} [data-glow-part="sparkle"]`)).toHaveCount(32); // 4 rings × 8
  await expect(page.locator(`${at} [data-glow-part="frame"]`).first()).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  await expect(page.locator(`${at} [data-glow-part="sparkle"]`).first()).toHaveCSS("mix-blend-mode", "plus-lighter");
  const { a, b } = await changesOverTime(page, `${at} [data-glow-part="sparkle"]`, (el) => `${el.style.left},${el.style.top}`);
  expect(a).not.toBe(b);
});

test("proc glow plays its flipbook", async ({ page }) => {
  const at = cell("Proc");
  await expect(page.locator(`${at} [data-glow-part="frame"]`).first()).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  // the start animation is on; after 0.7 s the loop takes over
  await expect(page.locator(`${at} [data-glow-part="procLoop"]`).first()).toHaveCSS("opacity", "1");
  const { a, b } = await changesOverTime(page, `${at} [data-glow-part="procLoop"]`, (el) => el.dataset.frame ?? "");
  expect(a).not.toBe(b);
});

test("the glow element's options and visibility are applied", async ({ page }) => {
  const at = cell("Pixel");
  await expect(page.locator(`${at} [data-glow-part="line"]`)).toHaveCount(8);
  // The agent pushes the same auras with other glow options; the open window follows.
  let next = glowGroup({ glowLines: 3, glowBorder: true, useGlowColor: true, glowColor: [1, 1, 1, 1] });
  await push(page, workspace, next.aura, next.children);
  await expect(page.locator(`${at} [data-glow-part="line"]`)).toHaveCount(3);
  await expect(page.locator(`${at} [data-glow-part="border"]`)).toHaveCount(1);
  await expect(page.locator(`${at} [data-glow-part="line"]`).first()).toHaveCSS("background-color", "rgb(255, 255, 255)");

  next = glowGroup({ glow: false });
  await push(page, workspace, next.aura, next.children);
  await expect(page.locator(`${at} [data-glow-part="line"]`)).toHaveCount(0);
  // the button glow fades out (animOut, 0.4 s) and ends hidden
  await expect(page.locator(`${cell("buttonOverlay")} [data-glow-part="ants"]`).first()).toHaveCSS("opacity", "0");
});
