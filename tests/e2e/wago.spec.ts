/**
 * wago JSON and wago links from outside: `.json` import and drop, JSON pushes (pretty and compact) and wago links in
 * Import and pushes. Wago's answer is recorded (WAGO_FIXTURES in playwright.config.ts): https://wago.io/LEPRolmHn.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const WAGO = path.resolve(__dirname, "../fixtures/wago");
const NAME = "Eye buff missing";

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** wago's own JSON of LEPRolmHn (as its API stores it, compact; its Editor shows it pretty), and its import string. */
const wagoCompact = () => readFile(path.join(WAGO, "LEPRolmHn.json"), "utf8");
const wagoJson = async () => JSON.stringify(JSON.parse(await wagoCompact()), null, 2);
const wagoCode = async () => (await readFile(path.join(WAGO, "LEPRolmHn.txt"), "utf8")).trim();

/** The same JSON after the page's addon (Musca 1.15.0, WeakAuras 5.22.0) encoded it: only the sender version differs. */
const reencoded = async () => (await wagoJson()).replace('"s": "5.21.9"', '"s": "5.22.0"');

const json = (page: Page) => page.getByLabel("wago JSON text");

async function openPage(page: Page, prefix: string): Promise<string> {
  const workspace = uniqueId(prefix);
  await page.goto(`/forever?w=${workspace}`);
  await expect(page.getByRole("treeitem")).toHaveCount(1, { timeout: 90_000 }); // the sample aura
  await page.getByRole("tab", { name: "JSON", exact: true }).click();
  return workspace;
}

async function openImport(page: Page) {
  const button = page.getByRole("button", { name: "Import", exact: true });
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
}

const imported = (page: Page) => page.getByRole("treeitem", { name: NAME, exact: true });

test("a wago JSON file imports by Choose file, and as a drop on the window", async ({ page }) => {
  await openPage(page, "json-file");
  await openImport(page);
  await page.getByLabel("Import files").setInputFiles({ name: "LEPRolmHn.json", mimeType: "application/json", buffer: Buffer.from(await wagoJson()) });
  await expect(imported(page)).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  await expect(json(page)).toHaveValue(await reencoded());

  // A compact copy, dropped: the same aura, added beside it (its id made unique, as the addon's import does).
  const compact = await wagoCompact();
  const dataTransfer = await page.evaluateHandle((text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], "eye.json", { type: "application/json" }));
    dt.items.add(new File(['{"not": "an aura"}'], "other.json", { type: "application/json" }));
    return dt;
  }, compact);
  const optionsWindow = page.getByRole("region", { name: "Musca Auras options" });
  await optionsWindow.dispatchEvent("dragenter", { dataTransfer });
  await optionsWindow.dispatchEvent("dragover", { dataTransfer });
  await optionsWindow.dispatchEvent("drop", { dataTransfer });
  await expect(page.getByRole("treeitem", { name: `${NAME} 2`, exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/Could not read other\.json: Not wago JSON/)).toBeVisible();
  await expect(page.getByRole("treeitem")).toHaveCount(3);
});

test("agents push wago JSON, pretty or compact, with the same answer and validation as its import string", async ({ page, request }) => {
  const workspace = await openPage(page, "json-push");
  const url = `/api/forever/workspaces/${workspace}/aura`;
  const viaCode = await request.post(`/api/forever/workspaces/${uniqueId("scratch")}/aura`, { data: { code: await wagoCode() } });
  expect(viaCode.ok(), await viaCode.text()).toBe(true);
  const expected = (await viaCode.json()).validation;

  const pretty = await request.post(url, { headers: { "Content-Type": "application/json" }, data: await wagoJson() });
  expect(pretty.status(), await pretty.text()).toBe(200);
  const answer = await pretty.json();
  expect(answer).toMatchObject({ workspace, code: expect.stringMatching(/^!WA:2!/), revision: expect.any(Number) });
  expect(answer.validation).toEqual(expected);
  await expect(imported(page)).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  await expect(json(page)).toHaveValue(await reencoded());

  // Compact, as plain text: the same aura, so it replaces the one there (same uid).
  const compact = await request.post(url, { headers: { "Content-Type": "text/plain" }, data: await wagoCompact() });
  expect(compact.status(), await compact.text()).toBe(200);
  expect((await compact.json()).validation).toEqual(expected);
  await expect(page.getByRole("treeitem")).toHaveCount(2);

  // Broken JSON and JSON wago can't rebuild: 400 and 422 with the reason.
  const broken = await request.post(url, { headers: { "Content-Type": "application/json" }, data: '{"d": {"id": "x"' });
  expect(broken.status()).toBe(400);
  expect((await broken.json()).error).toMatch(/Not JSON/);
  const refused = await request.post(url, { data: { d: { id: "x", triggers: 5 } } });
  expect(refused.status()).toBe(422);
  expect((await refused.json()).error).toMatch(/triggers/);
});

test("a wago link pasted into Import loads the aura from wago (recorded answer), byte-identical JSON", async ({ page }) => {
  await openPage(page, "wago-link");
  await openImport(page);
  const paste = page.getByLabel("Paste a code to load");

  // An id wago doesn't have: wago's 404, the text stays.
  await paste.fill("https://wago.io/NoSuchAura1");
  await page.getByRole("button", { name: "Add to workspace" }).click();
  await expect(page.getByText(/Could not import that: Could not fetch NoSuchAura1 from wago\.io: wago\.io has no aura/)).toBeVisible();
  await expect(paste).toHaveValue("https://wago.io/NoSuchAura1");
  // A link to one version isn't fetched.
  await paste.fill("https://wago.io/LEPRolmHn/1");
  await page.getByRole("button", { name: "Add to workspace" }).click();
  await expect(page.getByText(/aren't supported/)).toBeVisible();

  await paste.fill("https://wago.io/LEPRolmHn");
  await page.getByRole("button", { name: "Add to workspace" }).click();
  await expect(imported(page)).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  await expect(paste).toHaveValue("");
  // wago's own import string: the JSON tab shows exactly what wago.io's Editor shows.
  await expect.poll(() => page.evaluate(() => window.auraSimulator!.code())).toBe(await wagoCode());
  await expect(json(page)).toHaveValue(await wagoJson());

  // A bare id works too, and Load replaces the workspace.
  await paste.fill("LEPRolmHn");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByRole("treeitem")).toHaveCount(1);
  await expect(imported(page)).toBeVisible();
});

test("agents push a wago link; the server's wago route gives its import string", async ({ page, request }) => {
  const workspace = await openPage(page, "wago-push");
  const url = `/api/forever/workspaces/${workspace}/aura`;
  const viaCode = await request.post(`/api/forever/workspaces/${uniqueId("scratch")}/aura`, { data: { code: await wagoCode() } });
  const expected = await viaCode.json();

  const asText = await request.post(url, { headers: { "Content-Type": "text/plain" }, data: "https://wago.io/LEPRolmHn" });
  expect(asText.status(), await asText.text()).toBe(200);
  const answer = await asText.json();
  expect(answer.code).toBe(await wagoCode());
  expect(answer.validation).toEqual(expected.validation);
  await expect(imported(page)).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  await expect(json(page)).toHaveValue(await wagoJson());

  const asField = await request.post(url, { data: { wago: "LEPRolmHn" } });
  expect(asField.status()).toBe(200);
  expect((await asField.json()).code).toBe(await wagoCode());
  const missing = await request.post(url, { data: { wago: "https://wago.io/NoSuchAura1" } });
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error).toMatch(/wago\.io has no aura/);

  const route = await request.get("/api/forever/wago/LEPRolmHn");
  expect(await route.json()).toEqual({ id: "LEPRolmHn", code: await wagoCode() });
  expect((await request.get("/api/forever/wago/NoSuchAura1")).status()).toBe(404);
  expect((await request.get("/api/forever/wago/bad%20id")).status()).toBe(400);
});
