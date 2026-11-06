import { expect, test, type Page } from "@playwright/test";
import { ownWorkspacePage } from "../support/e2e-workspace";

// The dev server's spell database is seeded from tests/fixtures/spells (see global-setup.ts).

async function openPage(page: Page) {
  await page.goto(ownWorkspacePage("spells"));
  const icon = page.getByTestId("aura-preview").locator('[data-region-type="icon"] img');
  await expect(icon).toHaveAttribute("src", /spell_holy_magicalsentry/, { timeout: 60_000 });
  return icon;
}

test("search, pick with the keyboard, and the preview shows the spell's icon", async ({ page }) => {
  const icon = await openPage(page);
  await expect(page.getByTestId("spell-sync")).toContainText("build 1.60.1.70790");
  await expect(page.getByTestId("current-spell")).toContainText("Arcane Intellect");

  const search = page.getByRole("combobox", { name: "Search spells" });
  await search.fill("frostbolt");
  const options = page.getByRole("listbox", { name: "Spells" }).getByRole("option");
  await expect(options).toHaveCount(2);
  await expect(options.first()).toContainText("Frostbolt");
  await expect(options.first()).toContainText("116");

  // Keyboard-selected option gets a tooltip preview from /api/spells/<id>.
  await search.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await search.press("ArrowUp");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("spell-tooltip")).toContainText("Frostbolt");

  await search.press("Enter");
  await expect(icon).toHaveAttribute("src", /spell_frost_frostbolt02/);
  await expect(page.getByTestId("current-spell")).toContainText("Frostbolt");
  await expect(page.getByTestId("current-spell")).toContainText("ID 116");
  // The state code carries the new spell ID.
  await expect(page.getByLabel("State code")).not.toHaveValue("");
});

test("hovering a result shows its Wowhead tooltip; clicking picks it", async ({ page }) => {
  const icon = await openPage(page);
  // Everything above the search box has loaded (sync status, current spell), so the result list
  // doesn't move under the mouse after the hover; under load it used to, and another result got hovered.
  await expect(page.getByTestId("spell-sync")).toContainText("build 1.60.1.70790");
  await expect(page.getByTestId("current-spell")).toContainText("Arcane Intellect");
  const search = page.getByRole("combobox", { name: "Search spells" });
  await search.fill("arcane");
  const brilliance = page.getByRole("listbox", { name: "Spells" }).getByRole("option", { name: /Arcane Brilliance/ });
  // The hover counts once the option is the selected one (hovered again if something still moved it away).
  await expect(async () => {
    await brilliance.hover();
    await expect(brilliance).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  // The tooltip follows after its debounce and /api/spells/<id> (slow to compile on a busy dev server).
  await expect(page.getByTestId("spell-tooltip")).toContainText("Arcane Brilliance", { timeout: 20_000 });
  await expect(brilliance).toHaveAttribute("aria-selected", "true");
  await brilliance.click();
  await expect(icon).toHaveAttribute("src", /spell_holy_arcaneintellect/);
});

test("a flagged spell shows a warning with an explanation", async ({ page }) => {
  await openPage(page);
  const search = page.getByRole("combobox", { name: "Search spells" });
  await search.fill("word of recall");
  await page.getByRole("listbox", { name: "Spells" }).getByRole("option", { name: /Word of Recall/ }).click();
  const flag = page.getByTestId("current-spell").locator('[data-flag="icon-mismatch"]');
  await expect(flag).toHaveText("Icon differs");
  await expect(flag).toHaveAttribute("title", /different icons/);
});

test("a spell ID can be entered by hand; an unknown one is flagged and falls back to the question mark", async ({ page }) => {
  const icon = await openPage(page);
  const search = page.getByRole("combobox", { name: "Search spells" });
  await search.fill("99999999");
  await expect(page.getByRole("listbox", { name: "Spells" }).getByRole("option").first()).toHaveText(/Use spell ID 99999999/);
  await search.press("Enter");
  await expect(page.getByTestId("current-spell")).toContainText("ID 99999999");
  await expect(page.getByTestId("current-spell").locator('[data-flag="unknown"]')).toBeVisible();
  // iconSource -1: the unknown spell has no icon, so displayIcon (135932) is used.
  await expect(icon).toHaveAttribute("src", /spell_holy_magicalsentry/);
});

test("an unsynced cache shows a first-run prompt whose Sync button syncs", async ({ page }) => {
  // Browser-side stand-ins: the real server is seeded, and a real sync would hit wago.tools.
  let synced = false;
  const status = () => ({
    synced,
    product: "wowf",
    build: synced ? "1.60.1.70790" : null,
    syncedAt: synced ? "2026-11-06T12:00:00.000Z" : null,
    spellCount: synced ? 20 : 0,
    spellsWithIcon: synced ? 18 : 0,
    wowhead: { found: 0, notFound: 0 },
  });
  await page.route("**/api/spells/status", (route) => route.fulfill({ json: status() }));
  await page.route("**/api/spells/sync", (route) => {
    synced = true;
    return route.fulfill({ json: { ...status(), durationMs: 5 } });
  });

  await openPage(page);
  const prompt = page.getByRole("region", { name: "Spell list not downloaded" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Sync spells" }).click();
  await expect(prompt).toBeHidden();
  await expect(page.getByTestId("spell-sync")).toContainText("build 1.60.1.70790");
});

test("icon API maps FileDataIDs and spell IDs", async ({ request }) => {
  const one = await request.get("/api/icons/135932");
  expect(one.status()).toBe(200);
  expect(await one.json()).toEqual({
    fileDataId: 135932,
    icon: "spell_holy_magicalsentry",
    iconUrl: "https://wow.zamimg.com/images/wow/icons/large/spell_holy_magicalsentry.jpg",
  });
  expect((await request.get("/api/icons/1")).status()).toBe(404);
  expect((await request.get("/api/icons/abc")).status()).toBe(400);

  const batch = await request.get("/api/icons?files=135932,1&spells=116");
  expect(await batch.json()).toEqual({
    files: { 135932: "spell_holy_magicalsentry", 1: null },
    spells: { 116: "spell_frost_frostbolt02" },
  });
  expect((await request.get("/api/icons?files=x")).status()).toBe(400);
});
