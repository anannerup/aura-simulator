import { expect, test, type Page } from "@playwright/test";
import { toWagoJson } from "../../src/core/wago-json";
import { stateCode } from "../support/state-code";

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function iconSize(page: Page, id?: string): Promise<number> {
  const which = id ? `[data-aura-id="${id}"]` : "";
  const icon = page.getByTestId("aura-preview").locator(`[data-region-type="icon"]${which} img`);
  await expect(icon).toBeVisible({ timeout: 60_000 });
  // In UI units: the game screen scales them to the browser window.
  const screen = page.getByTestId("mock-screen");
  const uiHeight = Number(await screen.getAttribute("data-ui-height"));
  return Math.round(((await icon.boundingBox())!.width * uiHeight) / (await screen.boundingBox())!.height);
}

async function expectIconSize(page: Page, size: number, id?: string) {
  await expect.poll(() => iconSize(page, id), { timeout: 60_000 }).toBe(size);
}

const json = (page: Page) => page.getByLabel("wago JSON text");
/** The JSON tab lives in the drawer under the game screen. */
const openJson = (page: Page) => page.getByRole("tab", { name: "JSON", exact: true }).click();

async function editJson(page: Page, edit: (text: string) => string) {
  const text = await json(page).inputValue();
  const next = edit(text);
  expect(next).not.toBe(text);
  await json(page).fill(next);
}

/** The selected aura's wago JSON as Save as .json writes it: the code the page made (Musca 1.15.0 = WeakAuras 5.22.0). */
async function expectedJson(page: Page): Promise<string> {
  const state = (await page.evaluate(() => window.auraSimulator!.state()))!;
  return toWagoJson({ ...state, senderVersion: "5.22.0", transmissionVersion: 1421 });
}

test("the JSON tab shows the aura as wago JSON and applies edits; bad text keeps the work and the preview", async ({ page }) => {
  await page.goto(`/forever?w=${uniqueId("json")}`);
  await expectIconSize(page, 64);
  await openJson(page);
  await expect(json(page)).toHaveValue(await expectedJson(page));
  await expect(json(page)).toHaveValue(/^\{\n {2}"d": \{\n {4}"actions": \{/);
  await expect(json(page)).toHaveValue(/\n {6}"1": \{\n {8}"trigger": \{/); // triggers[1]: a number key, as wago writes it
  const original = await stateCode(page);

  await editJson(page, (t) => t.replace('"width": 64,', '"width": 48,'));
  await expect(page.getByTestId("json-editor-state")).toHaveText("Unapplied edits");
  await json(page).press("Control+Enter");
  await expectIconSize(page, 48);
  await expect(page.getByTestId("json-editor-state")).toHaveText("In sync");
  await expect.poll(() => stateCode(page)).not.toBe(original);
  const edited = await stateCode(page);
  await expect(json(page)).toHaveValue(await expectedJson(page));
  expect(new URL(page.url()).searchParams.has("code")).toBe(false); // auras never go in the address

  // Not JSON: a missing comma. The error names it, Apply keeps the text, the aura stays.
  await editJson(page, (t) => t.replace('"width": 48,', '"width": 48'));
  const broken = await json(page).inputValue();
  await expect(page.getByTestId("json-editor-error")).toContainText("Not JSON");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("json-editor-error")).toBeVisible();
  await expect(json(page)).toHaveValue(broken);
  await expect.poll(() => stateCode(page)).toBe(edited);

  // JSON that wago can't read as an aura: refused with wago's reason, text kept.
  await page.getByRole("button", { name: "Revert" }).click();
  await expect(page.getByTestId("json-editor-error")).toHaveCount(0);
  await editJson(page, (t) => t.replace(/^\{\n {2}"d":/, '{\n  "aura":'));
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("json-editor-error")).toContainText('it needs a "d" object');
  await expect(json(page)).toHaveValue(/^\{\n {2}"aura":/);
  await expect.poll(() => stateCode(page)).toBe(edited);

  // Compact JSON applies the same; the tab then shows the pretty form.
  await json(page).fill(JSON.stringify({ ...JSON.parse(await expectedJson(page)), d: { ...JSON.parse(await expectedJson(page)).d, width: 40 } }));
  await page.getByRole("button", { name: "Apply" }).click();
  await expectIconSize(page, 40);
  await expect(json(page)).toHaveValue(/\n {4}"width": 40,\n/);
});

test("a group's JSON holds its children in c; editing them applies to the group", async ({ page, request }) => {
  const workspace = uniqueId("json-group");
  const icon = (id: string, size: number) => ({
    id,
    uid: `JsonTab${size}`,
    regionType: "icon",
    displayIcon: 135932,
    width: size,
    height: size,
    xOffset: size * 2,
    triggers: { "1": { trigger: { type: "secretAura", unit: "player", debuffType: "HELPFUL", auraspellids: ["1459"] } }, activeTriggerMode: -10 },
  });
  const body = { d: { id: "JSON group", uid: "JsonTabGroup", regionType: "group" }, c: [icon("Child A", 30), icon("Child B", 34)], m: "d" };
  const pushed = await request.post(`/api/forever/workspaces/${workspace}/aura`, { data: body });
  expect(pushed.ok(), await pushed.text()).toBe(true);
  await page.goto(`/forever?w=${workspace}`);
  await expectIconSize(page, 30, "Child A");
  await openJson(page);
  await expect(json(page)).toHaveValue(/^\{\n {2}"c": \[\n {4}\{/);
  await expect(json(page)).toHaveValue(/"id": "Child B"/);

  // Resize B, rename A and add C: one edit of the whole group.
  const doc = JSON.parse(await json(page).inputValue());
  doc.c[1].width = 50;
  doc.c[0].id = "Child A renamed";
  doc.c.push({ ...icon("Child C", 26), uid: "JsonTabC" });
  await json(page).fill(JSON.stringify(doc, null, 2));
  await page.getByRole("button", { name: "Apply" }).click();
  await expectIconSize(page, 50, "Child B");
  await expectIconSize(page, 26, "Child C");
  await expect(page.getByRole("treeitem", { name: "Child A renamed", exact: true })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "Child A", exact: true })).toHaveCount(0);

  // One undo step brings the group back as it was.
  await page.getByRole("button", { name: "Undo" }).click();
  await expectIconSize(page, 34, "Child B");
  await expect(page.getByRole("treeitem", { name: "Child A", exact: true })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "Child C", exact: true })).toHaveCount(0);
  await expect(json(page)).toHaveValue(/"id": "Child A"/);
});

test("undo and redo step through JSON edits, pastes and agent pushes", async ({ page, request }) => {
  const workspace = uniqueId("undo");
  await page.goto(`/forever?w=${workspace}`);
  await expectIconSize(page, 64);
  await openJson(page);
  const sample = await stateCode(page);
  const undoButton = page.getByRole("button", { name: "Undo" });
  const redoButton = page.getByRole("button", { name: "Redo" });
  await expect(undoButton).toBeDisabled();

  await editJson(page, (t) => t.replace('"width": 64,', '"width": 50,'));
  await page.getByRole("button", { name: "Apply" }).click();
  await expectIconSize(page, 50);

  // An agent push (wago JSON) is its own step and shows in the JSON tab.
  await expect.poll(async () => (await (await request.get(`/api/forever/workspaces/${workspace}`)).json()).code).toMatch(/^!WA:2!/);
  const wago = JSON.parse(await json(page).inputValue());
  const pushed = await request.post(`/api/forever/workspaces/${workspace}/aura`, { data: { ...wago, d: { ...wago.d, width: 30 } } });
  expect(pushed.ok()).toBe(true);
  await expectIconSize(page, 30);
  await expect(json(page)).toHaveValue(/"width": 30/);

  await undoButton.click();
  await expectIconSize(page, 50);
  await expect(json(page)).toHaveValue(/"width": 50/);
  await undoButton.click();
  await expectIconSize(page, 64);
  await expect.poll(() => stateCode(page)).toBe(sample);
  await expect(undoButton).toBeDisabled();

  // Keyboard shortcuts work outside text fields; inside them the field's own undo applies.
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Control+Shift+Z");
  await expectIconSize(page, 50);
  await page.keyboard.press("Control+Y");
  await expectIconSize(page, 30);
  await expect(redoButton).toBeDisabled();
  await page.keyboard.press("Control+Z");
  await expectIconSize(page, 50);
  await expect(redoButton).toBeEnabled();

  // A push while the text has unapplied edits asks before replacing them.
  await editJson(page, (t) => t.replace('"width": 50', '"width": 51'));
  await request.post(`/api/forever/workspaces/${workspace}/aura`, { data: { ...wago, d: { ...wago.d, width: 33 } } });
  await expectIconSize(page, 33);
  await expect(page.getByText("The aura changed elsewhere")).toBeVisible();
  await expect(json(page)).toHaveValue(/"width": 51/);
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(json(page)).toHaveValue(/"width": 33/);
  await expect(redoButton).toBeDisabled(); // the push dropped the redo branch
});
