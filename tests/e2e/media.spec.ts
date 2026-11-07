/**
 * Game media from the outside, both games: the item, icon, file and media APIs (from the recorded wago.tools rows the
 * global setup seeds), the font sample page, game texture paths drawn by FileDataID, a visible placeholder and a
 * validation info where a texture can't be drawn, and the warning for a font a stock client doesn't have.
 */
import { expect, test, type Page } from "@playwright/test";
import { Blp, BlpImage, BLP_COLOR_FORMAT, BLP_IMAGE_FORMAT } from "@wowserhq/format";
import type { AuraDocument } from "@/core";
import { TBC_MINIMAL_PUSH } from "@/games/tbc/examples";
import { openPushed } from "../support/e2e-workspace";

test.describe.configure({ timeout: 180_000 });

const GAMES = [
  { game: "forever", item: { q: "major mana potion", id: 13444 }, wowhead: "classic" },
  { game: "tbc", item: { q: "super mana potion", id: 22832 }, wowhead: "tbc" },
] as const;

function syntheticBlp(): Buffer {
  const data = new Uint8Array(16 * 16 * 4).fill(200);
  const blp = new Blp();
  blp.setImage(new BlpImage(16, 16, data, BLP_IMAGE_FORMAT.IMAGE_ABGR8888), BLP_COLOR_FORMAT.COLOR_RAW);
  return Buffer.from(blp.save() as Uint8Array);
}

/** No network: wago.tools answers every FileDataID it is asked for with a small BLP, and records which. */
async function stubCasc(page: Page): Promise<string[]> {
  const asked: string[] = [];
  const blp = syntheticBlp();
  await page.route("https://wago.tools/api/casc/*", (route) => {
    asked.push(route.request().url().split("/").pop()!);
    return route.fulfill({ status: 200, body: blp, headers: { "access-control-allow-origin": "*" } });
  });
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.fulfill({ status: 404 }));
  await page.route("https://wow.zamimg.com/**", (route) => route.fulfill({ status: 404 }));
  return asked;
}

for (const { game, item, wowhead } of GAMES) {
  test(`${game}: items, icons, game files and media lists over HTTP`, async ({ request }) => {
    const search = await (await request.get(`/api/${game}/items/search?q=${encodeURIComponent(item.q)}`)).json();
    expect(search.results[0]).toMatchObject({ id: item.id, iconFileId: expect.any(Number), wowhead: `https://www.wowhead.com/${wowhead}/item=${item.id}` });
    expect((await request.get(`/api/${game}/items/${item.id}`)).status()).toBe(200);
    expect((await request.get(`/api/${game}/items/999999999`)).status()).toBe(404);

    const icons = await (await request.get(`/api/${game}/icons/search?q=food%20basilisk`)).json();
    expect(icons.results[0]).toMatchObject({ id: 134042, path: "Interface\\Icons\\INV_Misc_Food_86_Basilisk" });
    const potions = await (await request.get(`/api/${game}/icons/search?q=potion&offset=1&limit=1`)).json();
    expect(potions).toMatchObject({ offset: 1, limit: 1, total: expect.any(Number) });
    expect(potions.results).toHaveLength(1);
    expect((await request.get(`/api/${game}/icons/search?q=potion&offset=-1`)).status()).toBe(400);
    const byIcon = await (await request.get(`/api/${game}/items/search?icon=${encodeURIComponent("Interface\\Icons\\INV_Potion_72")}`)).json();
    expect(byIcon).toMatchObject({ icon: { id: 134852 }, offset: 0, total: 1, results: [{ id: 3827 }] });
    expect((await request.get(`/api/${game}/items/search?icon=no_such_icon`)).status()).toBe(404);
    // The similarity search refuses what isn't a picture before it looks at any icon (no network).
    expect((await request.post(`/api/${game}/icons/similar?q=potion`, { data: "hello", headers: { "content-type": "text/plain" } })).status()).toBe(415);
    expect((await request.post(`/api/${game}/icons/similar?q=potion`, { data: Buffer.from("not a png"), headers: { "content-type": "image/png" } })).status()).toBe(400);
    expect((await request.post(`/api/${game}/icons/similar?colour=sepia`, { data: Buffer.from("x"), headers: { "content-type": "image/png" } })).status()).toBe(400);

    const files = await (await request.get(`/api/${game}/files?path=${encodeURIComponent("Interface\\Cursor\\Cast")}&path=nope&ids=134042`)).json();
    expect(files.paths).toEqual({ "Interface\\Cursor\\Cast": { id: 131015, path: "Interface\\CURSOR\\Cast.blp" }, nope: null });
    expect(files.ids["134042"].path).toMatch(/INV_Misc_Food_86_Basilisk/);

    const media = await (await request.get(`/api/${game}/media`)).json();
    const names = (type: string) => media.types[type].entries.map((e: { name: string }) => e.name);
    expect(names("font")).toEqual(expect.arrayContaining(["Friz Quadrata TT", "PT Sans Narrow Regular"]));
    expect(names("border")).toContain("Square Full White");
    expect(media.types.font.default).toBe("Friz Quadrata TT");
    expect(media.fontSamples).toMatch(new RegExp(`/${game}/fonts\\?ref=`));
  });
}

test("the font sample page draws every font with the given text", async ({ page }) => {
  await stubCasc(page);
  await page.goto("/tbc/fonts?text=Food%2012&size=24");
  const row = page.locator('[data-font="PT Sans Narrow Regular"]');
  await expect(row).toContainText("Food 12", { timeout: 90_000 });
  await expect(page.locator('[data-font="Friz Quadrata TT"]')).toContainText("default");
  // Long file paths wrap inside their column instead of running over the sample beside them.
  for (const row of await page.locator("li[data-font]").all()) {
    const [label, sample] = await Promise.all([row.locator("div").first().boundingBox(), row.locator("div").nth(1).boundingBox()]);
    const file = await row.locator("code").boundingBox();
    expect(file!.x + file!.width).toBeLessThanOrEqual(sample!.x);
    expect(label!.x + label!.width).toBeLessThanOrEqual(sample!.x);
  }
});

test("a font sample picture: one font drawing a text, as a PNG, without a browser", async ({ page, request }) => {
  const sample = (query: string) => request.get(`/api/tbc/fonts/sample.png?${query}`, { timeout: 120_000 });
  const res = await sample("font=PT+Sans+Narrow+Bold&text=12&size=12&scale=2&background=404040");
  expect(res.status(), res.status() === 200 ? "" : await res.text()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  const png = await res.body();
  const { width, height } = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  // About a 12-unit line at 2 px per unit, with room for the outline.
  expect(height).toBeGreaterThanOrEqual(24);
  expect(height).toBeLessThan(48);
  expect(width).toBeGreaterThan(16);
  // The outline is drawn: another picture without it differs.
  const plain = await (await sample("font=PT+Sans+Narrow+Bold&text=12&size=12&scale=2&background=404040&outline=None")).body();
  expect(plain.equals(png)).toBe(false);
  expect((await sample("font=PT+Sans+Narrow+Bold&size=0")).status()).toBe(400);
  expect((await sample("text=12")).status()).toBe(400);

  // The page it is taken from marks itself ready once the addon's font is in.
  await page.goto("/tbc/fonts/sample?font=PT+Sans+Narrow+Bold&text=12&size=12");
  const picture = page.getByTestId("font-sample");
  await expect(picture).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await expect(picture).toHaveAttribute("data-font", "loaded");
});

test("a picture of any texture by path, and the icon index's progress", async ({ request }) => {
  const square = await request.get(`/api/tbc/textures/picture.png?path=${encodeURIComponent("Interface\\AddOns\\WeakAuras\\Media\\Textures\\Square_White")}`);
  expect(square.status(), square.status() === 200 ? "" : await square.text()).toBe(200);
  expect(square.headers()["content-type"]).toBe("image/png");
  expect((await request.get(`/api/tbc/textures/picture.png?path=${encodeURIComponent("Interface\\Nope\\Nothing")}`)).status()).toBe(404);
  expect((await request.get("/api/tbc/textures/picture.png")).status()).toBe(400);

  const status = await (await request.get("/api/tbc/icons/similar")).json();
  expect(status.icons.total).toBeGreaterThan(0);
  // The game's other textures and the addon's own (its Media\Textures among them).
  expect(status.textures.total).toBeGreaterThan(50);
  expect(status).toHaveProperty("building");
});

test("a game texture path draws by its FileDataID; a missing one shows a placeholder and a validation info", async ({ page }) => {
  const asked = await stubCasc(page);
  const aura: AuraDocument = {
    id: "Media",
    regionType: "icon",
    width: 64,
    height: 64,
    displayIcon: "Interface\\Icons\\INV_Misc_Food_86_Basilisk",
    iconSource: 0,
    triggers: TBC_MINIMAL_PUSH.aura.triggers,
    subRegions: [
      { type: "subbackground" },
      { type: "subtexture", textureTexture: "Interface\\Cursor\\Cast", textureVisible: true },
      { type: "subtexture", textureTexture: "Interface\\Nope\\Nothing", textureVisible: true },
      { type: "subtext", text_text: "Food", text_font: "PT Sans Narrow", text_visible: true },
    ],
  };
  const workspace = await openPushed(page, aura, [], "tbc");
  const textures = page.getByTestId("aura-preview").locator('[data-subregion="subtexture"]');
  await expect(textures.nth(0)).toHaveAttribute("data-texture", "loaded", { timeout: 60_000 });
  expect(asked).toContain("131015");
  await expect(textures.nth(1)).toHaveAttribute("data-texture", "missing");
  await expect(textures.nth(1).getByTestId("missing-texture")).toBeVisible();

  const res = await page.request.post(`/api/tbc/workspaces/${workspace}/aura`, { data: { aura } });
  const { validation } = await res.json();
  const codes = validation.warnings.map((w: { code: string; message: string }) => `${w.code}: ${w.message}`);
  expect(codes).toEqual(
    expect.arrayContaining([expect.stringMatching(/^media\.texture: Texture "Interface\\Nope\\Nothing"/), expect.stringMatching(/^media\.font: Font "PT Sans Narrow"/)]),
  );
  expect(codes.filter((c: string) => c.startsWith("media.texture"))).toHaveLength(1);
});
