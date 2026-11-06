import { expect, test, type Page } from "@playwright/test";

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function iconSize(page: Page): Promise<number> {
  const icon = page.getByTestId("aura-preview").locator('[data-region-type="icon"] img');
  await expect(icon).toBeVisible({ timeout: 60_000 });
  // In UI units: the mock screen scales them to the browser window.
  const screen = page.getByTestId("mock-screen");
  const uiHeight = Number(await screen.getAttribute("data-ui-height"));
  return Math.round(((await icon.boundingBox())!.width * uiHeight) / (await screen.boundingBox())!.height);
}

async function expectIconSize(page: Page, size: number) {
  await expect.poll(() => iconSize(page), { timeout: 60_000 }).toBe(size);
}

const raw = (page: Page) => page.getByLabel("Raw table text");
/** The raw table lives in a tab of the drawer under the game screen. */
const openRaw = (page: Page) => page.getByRole("tab", { name: "Raw table" }).click();
const stateCode = (page: Page) => page.getByLabel("State code");

async function editRaw(page: Page, edit: (text: string) => string) {
  const text = await raw(page).inputValue();
  const next = edit(text);
  expect(next).not.toBe(text);
  await raw(page).fill(next);
}

test("edit the raw table: preview and state code follow; invalid text keeps the work and the preview", async ({ page }) => {
  await page.goto(`/?w=${uniqueId("raw")}`);
  await expectIconSize(page, 64);
  await openRaw(page);
  await expect(raw(page)).toHaveValue(/^\{\n {2}actions = /);
  await expect(raw(page)).toHaveValue(/\n {2}width = 64,\n/);
  await expect(raw(page)).toHaveValue(/\[1\] = \{/); // triggers[1] is a number key
  const original = await stateCode(page).inputValue();

  await editRaw(page, (t) => t.replace("width = 64,", "width = 48,"));
  await expect(page.getByTestId("raw-editor-state")).toHaveText("Unapplied edits");
  await raw(page).press("Control+Enter");
  await expectIconSize(page, 48);
  await expect(page.getByTestId("raw-editor-state")).toHaveText("In sync");
  await expect(stateCode(page)).not.toHaveValue(original);
  const edited = await stateCode(page).inputValue();
  expect(edited).toMatch(/^!WA:2!/);
  expect(new URL(page.url()).searchParams.has("code")).toBe(false); // auras never go in the address

  // Break the text: a missing comma on line 2.
  await editRaw(page, (t) => t.replace(/^( {2}actions = .*),$/m, "$1"));
  const broken = await raw(page).inputValue();
  await expect(page.getByTestId("raw-editor-error")).toContainText(/Line 3, column 3: '\}' or ',' expected/);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("raw-editor-error")).toBeVisible();
  await expect(raw(page)).toHaveValue(broken);
  await expect(stateCode(page)).toHaveValue(edited);
  await expectIconSize(page, 48);

  // The JSON form shows the canonical document; switching needs valid text.
  await page.getByRole("button", { name: "JSON" }).click();
  await expect(page.getByTestId("raw-editor-error")).toContainText("Fix the error before switching");
  await page.getByRole("button", { name: "Revert" }).click();
  await expect(page.getByTestId("raw-editor-error")).toHaveCount(0);
  await page.getByRole("button", { name: "JSON" }).click();
  await expect(raw(page)).toHaveValue(/"width": 48/);
  await expect(raw(page)).toHaveValue(/"\[1\]": \{/);
  await editRaw(page, (t) => t.replace('"width": 48', '"width": 40'));
  await page.getByRole("button", { name: "Apply" }).click();
  await expectIconSize(page, 40);
});

test("undo and redo step through raw edits, pastes and agent pushes", async ({ page, request }) => {
  const workspace = uniqueId("undo");
  await page.goto(`/?w=${workspace}`);
  await expectIconSize(page, 64);
  await openRaw(page);
  const sample = await stateCode(page).inputValue();
  const undoButton = page.getByRole("button", { name: "Undo" });
  const redoButton = page.getByRole("button", { name: "Redo" });
  await expect(undoButton).toBeDisabled();

  await editRaw(page, (t) => t.replace("width = 64,", "width = 50,"));
  await page.getByRole("button", { name: "Apply" }).click();
  await expectIconSize(page, 50);

  // An agent push is its own step and shows in the raw view.
  await expect.poll(async () => (await (await request.get(`/api/workspaces/${workspace}`)).json()).code).toMatch(/^!WA:2!/);
  await page.getByRole("button", { name: "JSON" }).click();
  const doc = JSON.parse(await raw(page).inputValue());
  const pushed = await request.post(`/api/workspaces/${workspace}/aura`, { data: { aura: { ...doc, width: 30 } } });
  expect(pushed.ok()).toBe(true);
  await expectIconSize(page, 30);
  await expect(raw(page)).toHaveValue(/"width": 30/);

  await undoButton.click();
  await expectIconSize(page, 50);
  await expect(raw(page)).toHaveValue(/"width": 50/);
  await undoButton.click();
  await expectIconSize(page, 64);
  await expect(stateCode(page)).toHaveValue(sample);
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

  // A push while the raw text has unapplied edits asks before replacing them.
  await editRaw(page, (t) => t.replace('"width": 50', '"width": 51'));
  await request.post(`/api/workspaces/${workspace}/aura`, { data: { aura: { ...doc, width: 33 } } });
  await expectIconSize(page, 33);
  await expect(page.getByText("The aura changed elsewhere")).toBeVisible();
  await expect(raw(page)).toHaveValue(/"width": 51/);
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(raw(page)).toHaveValue(/"width": 33/);
  await expect(redoButton).toBeDisabled(); // the push dropped the redo branch
});
