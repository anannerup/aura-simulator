/**
 * Texts on the game screen, per game: X/Y Offset of a sub text is `text_anchorXOffset`/`text_anchorYOffset` (what
 * SubText.lua anchors by; the `anchorXOffset` keys in the addon's sub text defaults are never read), and custom text
 * (%c) is drawn as a visible marker, since the simulator doesn't run the aura's custom code.
 */
import { expect, test } from "@playwright/test";

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const subtext = (text_text: string, more: Record<string, unknown> = {}) => ({
  type: "subtext",
  text_text,
  text_visible: true,
  anchor_point: "CENTER",
  text_selfPoint: "AUTO",
  text_fontSize: 12,
  ...more,
});

for (const game of ["tbc", "forever"]) {
  test(`${game}: sub texts move by text_anchorXOffset only, and custom text draws a marker`, async ({ page, request }) => {
    test.setTimeout(180_000);
    const workspace = uniqueId(`texts-${game}`);
    const aura = {
      id: "Texts",
      regionType: "icon",
      width: 64,
      height: 64,
      anchorPoint: "CENTER",
      selfPoint: "CENTER",
      xOffset: 0,
      yOffset: 0,
      triggers: { "[1]": { trigger: { type: "aura2", unit: "player", debuffType: "HELPFUL", auranames: ["Well Fed"], useName: true }, untrigger: {} } },
      subRegions: [
        { type: "subbackground" },
        subtext("A", { text_anchorXOffset: 20, text_anchorYOffset: 10 }),
        subtext("B", { anchorXOffset: 20, anchorYOffset: 10 }),
        subtext("%c left"),
      ],
      customText: "function() return 'x' end",
    };
    const res = await request.post(`/api/${game}/workspaces/${workspace}/aura`, { data: { aura } });
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).preview.displays[0].texts).toEqual([
      { subRegion: 2, text: "A", visible: true },
      { subRegion: 3, text: "B", visible: true },
      { subRegion: 4, text: "[%c] left", visible: true, customText: "not evaluated" },
    ]);

    await page.goto(`/${game}?w=${workspace}`);
    const region = page.getByTestId("aura-preview").locator('[data-aura-id="Texts"]');
    await expect(region).toBeVisible({ timeout: 90_000 });
    const texts = region.locator('[data-subregion="subtext"]');
    await expect(texts.nth(2)).toHaveText("[%c] left");
    await expect(texts.nth(2).locator("[data-custom-text]")).toHaveAttribute("title", /isn't evaluated/);
    // The aura's state comes partly from custom code the simulator doesn't run: the region says so.
    await expect(region.getByTestId("custom-code-marker")).toHaveAttribute("title", /Custom code not evaluated: custom text \(%c\)/);

    const box = (await region.boundingBox())!;
    const unit = box.width / 64;
    const center = async (i: number) => {
      const b = (await texts.nth(i).boundingBox())!;
      return { x: b.x + b.width / 2 - (box.x + box.width / 2), y: b.y + b.height / 2 - (box.y + box.height / 2) };
    };
    const a = await center(0);
    const b = await center(1);
    expect(a.x / unit).toBeCloseTo(20, 0);
    expect(a.y / unit).toBeCloseTo(-10, 0); // up in the game is up on the screen
    expect(Math.abs(b.x / unit)).toBeLessThan(1);
    expect(Math.abs(b.y / unit)).toBeLessThan(1);

    // A picture is the aura as the game draws it: no simulator badge over it (the preview's notEvaluated says it).
    await page.goto(`/${game}/render?w=${workspace}&aura=Texts`);
    const picture = page.getByTestId("aura-render");
    await expect(picture).toHaveAttribute("data-ready", "true", { timeout: 90_000 });
    await expect(picture.locator('[data-aura-id="Texts"]')).toBeVisible();
    await expect(picture.getByTestId("custom-code-marker")).toHaveCount(0);
  });
}
