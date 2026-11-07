/**
 * Seam A: the addon's LibSharedMedia lists in each game's full VM (the game's own media plus what the addon
 * registers, as a stock client with only the addon has them), and the warning for a media name an aura uses that
 * isn't in them. The renderers' media map (src/render/media.ts) must name every entry.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { loadAddon, type AuraCore, type AuraDocument } from "@/core";
import { BORDER_EDGES, FONTS, STATUSBAR_TEXTURES } from "@/render/media";
import { cachedAddonFetcher } from "../../tests/support/addon-source";
import { TBC_TEST_VERSION, weakAuras2Available, weakAuras2Fetcher } from "../../tests/support/weakauras2";

type MediaLists = Record<string, { list: { name: string; file: string | number }[]; default?: string }>;

const cores: Partial<Record<"forever" | "tbc", AuraCore>> = {};

beforeAll(async () => {
  cores.forever = await loadAddon("v1.15.0", { fetchSource: cachedAddonFetcher("v1.15.0") });
  await cores.forever.loadFullAddon();
  if (await weakAuras2Available()) {
    cores.tbc = await loadAddon(TBC_TEST_VERSION, { fetchSource: weakAuras2Fetcher(), game: "tbc" });
    await cores.tbc.loadFullAddon();
  }
}, 240_000);
afterAll(() => Object.values(cores).forEach((c) => c.dispose()));

const names = (media: MediaLists, kind: string) => media[kind].list.map((e) => e.name);

describe.each(["forever", "tbc"] as const)("%s", (game) => {
  const core = (ctx: { skip: () => void }) => {
    if (!cores[game]) ctx.skip();
    return cores[game]!;
  };

  test("LibSharedMedia lists carry the addon's own registrations next to the game's media", async (ctx) => {
    const media = (await core(ctx).registries()).media as MediaLists;
    expect(names(media, "font")).toEqual(expect.arrayContaining(["Friz Quadrata TT", "Arial Narrow", "PT Sans Narrow Regular", "Fira Mono Medium"]));
    expect(names(media, "border")).toEqual(expect.arrayContaining(["None", "Square Full White", "Drop Shadow", "Blizzard Tooltip"]));
    expect(names(media, "statusbar")).toEqual(expect.arrayContaining(["Blizzard", "Solid", "Clean", "Thin Stripes"]));
    expect(media.font.default).toBe("Friz Quadrata TT");
  });

  test("the renderers can draw every font, border and bar texture of the lists", async (ctx) => {
    const media = (await core(ctx).registries()).media as MediaLists;
    // The western client's list also names the Chinese fonts (LibSharedMedia-3.0.lua:178-180); they aren't drawn.
    const fonts = names(media, "font").filter((n) => !n.startsWith("AR "));
    expect(fonts.filter((n) => !(n in FONTS))).toEqual([]);
    expect(names(media, "border").filter((n) => !(n in BORDER_EDGES))).toEqual([]);
    expect(names(media, "statusbar").filter((n) => !(n in STATUSBAR_TEXTURES))).toEqual([]);
  });

  test("an unknown font name warns that a stock client draws the default font", async (ctx) => {
    const c = core(ctx);
    const aura: AuraDocument = {
      ...(await c.newAura("icon")),
      id: "Fonts",
      subRegions: [
        { type: "subbackground" },
        { type: "subtext", text_text: "%p", text_font: "PT Sans Narrow" },
        { type: "subtext", text_text: "%s", text_font: "PT Sans Narrow Bold" },
        { type: "subborder", border_edge: "Square Full White" },
      ],
    };
    const result = await c.validate({ aura, children: [] });
    const media = result.warnings.filter((w) => w.code.startsWith("media."));
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({
      code: "media.font",
      severity: "warning",
      pointer: { tab: "region", property: "sub.2.text_font", path: ["subRegions", 2, "text_font"] },
    });
    expect(media[0].message).toMatch(/"PT Sans Narrow".*default font \("Friz Quadrata TT"\).*SharedMedia, ElvUI/);
  });

  test("an unknown border style warns that the game draws no border", async (ctx) => {
    const c = core(ctx);
    const aura: AuraDocument = { ...(await c.newAura("icon")), id: "Border", subRegions: [{ type: "subbackground" }, { type: "subborder", border_edge: "1 Pixel" }] };
    const result = await c.validate({ aura, children: [] });
    expect(result.warnings.find((w) => w.code === "media.border")?.message).toMatch(/"1 Pixel".*no border/);
  });
});
