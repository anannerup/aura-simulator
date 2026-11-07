/**
 * `/tbc`: official WeakAuras2 (5.22.1 from its release zip, cached in .cache/weakauras2) on TBC Anniversary, from the
 * outside: push and export, the spell picker on TBC's spell database, no combat check, New Aura without Musca's extras,
 * the addon's own import refusal (story 7), the addon media and the agent docs. Recorded upstream answers, no network.
 * The tab sweep for /tbc is in tab-sweep.spec.ts.
 */
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { TBC_MINIMAL_PUSH, TBC_MINIMAL_WAGO_JSON } from "@/games/tbc/examples";
import { ownWorkspacePage } from "../support/e2e-workspace";
import { stateCode } from "../support/state-code";

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const NEWER = /created with a newer version of WeakAuras/;

/** The window on /tbc (a hidden Forever window may still be in the DOM after client navigation). */
const tbcWindow = (page: Page) => page.getByRole("region", { name: "WeakAuras options" });

async function openWorkspace(page: Page, workspace: string) {
  await page.goto(`/tbc?w=${workspace}`);
  await expect(page.getByRole("region", { name: "Situation" })).toBeVisible({ timeout: 90_000 });
}

test("an agent pushes a TBC aura; the window shows it and exports its import string", async ({ page, request }) => {
  const workspace = uniqueId("tbc-push");
  const res = await request.post(`/api/tbc/workspaces/${workspace}/aura`, { data: TBC_MINIMAL_PUSH });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.url).toMatch(new RegExp(`/tbc\\?w=${workspace}$`));
  expect(body.code).toMatch(/^!WA:2!/);
  // WeakAuras2's own validation: no errors, and no combat verdict (TBC Anniversary has no combat restrictions).
  expect(body.validation.errors).toEqual([]);
  expect(body.validation.combat).toBeUndefined();

  await openWorkspace(page, workspace);
  await expect(tbcWindow(page).getByRole("treeitem", { name: /Arcane Intellect/ })).toBeVisible();
  await expect(page.getByTestId("aura-preview").locator('[data-region-type="icon"]')).toBeVisible();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save as file" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Arcane Intellect.txt");
  const text = (await readFile((await file.path())!, "utf8")).trim();
  expect(text).toBe(await stateCode(page));
  // The exported code carries WeakAuras2's version, not Musca's.
  const decoded = await page.request.post(`/api/tbc/workspaces/${uniqueId("tbc-reimport")}/aura?validate=false`, { data: { code: text } });
  expect(decoded.status(), await decoded.text()).toBe(200);
});

test("/tbc previews icon, bar, text, texture and progress texture auras on aura2 triggers, in and out of combat", async ({ page, request }) => {
  const trigger = TBC_MINIMAL_PUSH.aura.triggers;
  const types = ["icon", "aurabar", "text", "texture", "progresstexture"];
  const workspace = uniqueId("tbc-types");
  // The page is open while the agent pushes: each push joins the workspace's top level, live.
  await openWorkspace(page, workspace);
  for (const [i, regionType] of types.entries()) {
    const aura = { id: `TBC ${regionType}`, regionType, triggers: trigger, xOffset: -300 + i * 150, displayText: "%p" };
    const res = await request.post(`/api/tbc/workspaces/${workspace}/aura`, { data: { aura } });
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).validation.errors, regionType).toEqual([]);
    await expect(tbcWindow(page).getByRole("treeitem", { name: `TBC ${regionType}` })).toBeVisible({ timeout: 30_000 });
  }
  const preview = page.getByTestId("aura-preview");
  const shown = async () => {
    for (const regionType of types) await expect(preview.locator(`[data-aura-id="TBC ${regionType}"][data-region-type="${regionType}"]`), regionType).toBeVisible({ timeout: 30_000 });
    await expect(preview.locator('[data-frozen="true"]')).toHaveCount(0);
  };
  await shown();
  await page.getByRole("region", { name: "Situation" }).getByRole("switch", { name: "In combat" }).click();
  await shown();
});

test("no combat check on /tbc: the addon's own checks, and In combat changes nothing frozen", async ({ page, request }) => {
  const workspace = uniqueId("tbc-checks");
  expect((await request.post(`/api/tbc/workspaces/${workspace}/aura?validate=false`, { data: TBC_MINIMAL_PUSH })).ok()).toBe(true);
  await openWorkspace(page, workspace);

  const panel = page.getByTestId("validation-panel");
  await expect(panel).toHaveAttribute("data-state", "done", { timeout: 90_000 });
  await expect(panel.getByTestId("combat-status")).toHaveCount(0);
  await expect(panel).not.toHaveAttribute("data-combat-status", /./);
  await expect(panel.getByTestId("no-problems")).toHaveText("WeakAuras finds no problems with this aura.");
  await expect(panel).toContainText("these are WeakAuras's own checks");
  await expect(page.getByRole("button", { name: "Addon check" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Combat check" })).toHaveCount(0);

  // The situation controls show TBC's trigger kinds (the plain Aura trigger), and combat is only a world fact.
  const situation = page.getByRole("region", { name: "Situation" });
  await expect(situation.getByText("Trigger 1: Aura", { exact: true })).toBeVisible();
  await expect(situation.getByText("Aura (Modern)")).toHaveCount(0);
  await situation.getByRole("switch", { name: "In combat" }).click();
  await expect(situation.getByRole("switch", { name: "In combat" })).toBeChecked();
  const icon = page.getByTestId("aura-preview").locator('[data-region-type="icon"]');
  await expect(icon).toBeVisible();
  await expect(page.getByTestId("aura-preview").locator('[data-frozen="true"]')).toHaveCount(0);
});

test("the spell picker searches TBC Anniversary's spells, with TBC tooltips", async ({ page }) => {
  await page.goto(ownWorkspacePage("tbc-spells", "tbc"));
  await expect(page.getByTestId("spell-sync")).toContainText("build 2.5.6.70577", { timeout: 90_000 });
  // The sample is TBC's: Arcane Intellect rank 6 on the plain Aura trigger.
  await expect(page.getByTestId("current-spell")).toContainText("ID 27126");

  const search = page.getByRole("combobox", { name: "Search spells" });
  await search.fill("lifebloom");
  const option = page.getByRole("listbox", { name: "Spells" }).getByRole("option", { name: /Lifebloom/ });
  await expect(option).toContainText("33763");
  await option.hover();
  await expect(page.getByTestId("spell-tooltip")).toContainText("Lifebloom", { timeout: 20_000 });
  await option.click();
  await expect(page.getByTestId("current-spell")).toContainText("Lifebloom");
  await expect(page.getByTestId("current-spell")).toContainText("ID 33763");
  await expect(page.getByTestId("current-spell")).not.toContainText("Not in Forever");
  const icon = page.getByTestId("aura-preview").locator('[data-region-type="icon"] img');
  await expect(icon).toHaveAttribute("src", /inv_misc_herb_felblossom/);
});

test("New Aura on /tbc offers only what WeakAuras2 offers", async ({ page }) => {
  await page.goto(ownWorkspacePage("tbc-new", "tbc"));
  await page.getByRole("button", { name: "New Aura" }).click();
  const chooser = page.getByRole("region", { name: "New aura" });
  await expect(chooser.locator('button[data-type="icon"]')).toBeEnabled({ timeout: 90_000 });
  await expect(chooser.getByText("Premade Auras", { exact: true })).toBeVisible();
  await expect(chooser.locator('button[data-type="modern-group"]')).toHaveCount(0);
  await expect(chooser.getByText("Packs", { exact: true })).toHaveCount(0);
  await chooser.locator('button[data-type="aurabar"]').click();
  await expect(tbcWindow(page).getByRole("treeitem", { name: /New/ })).toBeVisible({ timeout: 60_000 });
});

test("story 7: an aura made with a newer WeakAuras is refused as the game's import refuses it", async ({ page, request }) => {
  // Over HTTP: the addon's import dialog's message, 422.
  const newer = { aura: { ...TBC_MINIMAL_PUSH.aura, internalVersion: 999 } };
  const res = await request.post(`/api/tbc/workspaces/${uniqueId("tbc-newer")}/aura`, { data: newer });
  expect(res.status()).toBe(422);
  expect((await res.json()).error).toMatch(NEWER);

  // A Musca Auras code (internalVersion 92, WeakAuras2 5.22.1 is at 90) pasted into /tbc's Import.
  const forever = await request.post(`/api/forever/workspaces/${uniqueId("musca")}/aura?validate=false`, {
    data: { aura: { id: "From Forever", regionType: "icon", width: 40, height: 40, internalVersion: 92 } },
  });
  const muscaCode = (await forever.json()).code as string;
  await page.goto(ownWorkspacePage("tbc-paste", "tbc"));
  await page.waitForFunction(() => window.auraSimulator, undefined, { timeout: 90_000 });
  const before = await stateCode(page);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("textbox", { name: "Paste a code to load" }).fill(muscaCode);
  await page.getByRole("button", { name: "Add to workspace" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not import that" })).toContainText(NEWER, { timeout: 60_000 });
  expect(await stateCode(page)).toBe(before);

  // In the page: window.auraSimulator.load answers with the addon's message, and nothing changes.
  const loaded = await page.evaluate((input) => window.auraSimulator!.load(input), newer);
  expect(loaded).toEqual({ ok: false, error: expect.stringMatching(NEWER) });
});

test("wago JSON and wago links work on /tbc: push, paste into Import", async ({ page, request }) => {
  // wago JSON, pretty, as the docs show it.
  const workspace = uniqueId("tbc-json");
  const json = await request.post(`/api/tbc/workspaces/${workspace}/aura`, {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify(TBC_MINIMAL_WAGO_JSON, null, 2),
  });
  expect(json.status(), await json.text()).toBe(200);
  expect((await json.json()).validation.errors).toEqual([]);

  // A wago link (recorded wago answer: a WeakAuras 5.21.9 aura, internalVersion 90, which WeakAuras2 5.22.1 imports).
  const link = await request.post(`/api/tbc/workspaces/${workspace}/aura?validate=false`, { data: "https://wago.io/LEPRolmHn" });
  expect(link.status(), await link.text()).toBe(200);

  await page.goto(ownWorkspacePage("tbc-wago", "tbc"));
  await page.waitForFunction(() => window.auraSimulator, undefined, { timeout: 90_000 });
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByRole("textbox", { name: "Paste a code to load" }).fill("https://wago.io/LEPRolmHn");
  await page.getByRole("button", { name: "Add to workspace" }).click();
  await expect(tbcWindow(page).getByRole("treeitem", { name: /Eye buff missing/ })).toBeVisible({ timeout: 60_000 });
});

test("WeakAuras2's media (logo, addon textures) come from its release zip through the server", async ({ page, request }) => {
  const logo = await request.get("/api/tbc/addon/5.22.1/file?path=WeakAuras%2FMedia%2FTextures%2Flogo_256_round.tga");
  expect(logo.status()).toBe(200);
  expect((await logo.body()).length).toBeGreaterThan(1000);
  expect(logo.headers()["cache-control"]).toContain("immutable");

  const requested = page.waitForResponse((r) => r.url().includes("/api/tbc/addon/5.22.1/file?path=WeakAuras%2FMedia%2FTextures%2Flogo_256_round.tga"), {
    timeout: 90_000,
  });
  await page.goto(ownWorkspacePage("tbc-media", "tbc"));
  expect((await requested).status()).toBe(200);
});

test("TBC's agent docs: generated from WeakAuras2, without Forever's combat rules", async ({ request, page }) => {
  const res = await request.get("/tbc/llms.txt");
  expect(res.status()).toBe(200);
  const md = await res.text();
  expect(md).toContain("TBC Anniversary");
  expect(md).toContain("WeakAuras 5.22.1 (internalVersion 90)");
  expect(md).toContain("POST /api/tbc/workspaces/<id>/aura");
  expect(md).not.toMatch(/Combat rules|secretAura|Musca/);
  await page.goto("/tbc/docs/agents");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("TBC Anniversary");
});
