import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { toWagoJson } from "../../src/core/wago-json";
import { stateCode } from "../support/state-code";

/** A variant of the sample icon aura (see src/core/samples.ts). */
function iconAura(id: string, size: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    uid: `E2e${size}`,
    internalVersion: 92,
    regionType: "icon",
    displayIcon: 135932,
    iconSource: -1,
    width: size,
    height: size,
    anchorFrameType: "SCREEN",
    anchorPoint: "CENTER",
    selfPoint: "CENTER",
    xOffset: 0,
    yOffset: 0,
    triggers: {
      "[1]": {
        trigger: { type: "secretAura", unit: "player", debuffType: "HELPFUL", auraspellids: ["1459"] },
        untrigger: {},
      },
      activeTriggerMode: -10,
    },
    load: {},
    conditions: {},
    actions: { start: {}, finish: {}, init: {} },
    ...extra,
  };
}

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Encodes an aura through the push API on a scratch workspace no page follows. */
async function encode(request: APIRequestContext, aura: object): Promise<string> {
  const res = await request.post(`/api/forever/workspaces/${uniqueId("scratch")}/aura?validate=false`, { data: { aura } });
  expect(res.ok()).toBe(true);
  return (await res.json()).code as string;
}

async function iconSize(page: Page, id?: string): Promise<number> {
  const which = id ? `[data-aura-id="${id}"]` : "";
  const icon = page.getByTestId("aura-preview").locator(`[data-region-type="icon"]${which} img`);
  await expect(icon).toBeVisible({ timeout: 60_000 });
  // In UI units: the game screen scales UI units to the browser.
  const screen = (await page.getByTestId("aura-preview").boundingBox())!;
  const uiHeight = Number(await page.getByTestId("mock-screen").getAttribute("data-ui-height"));
  return Math.round(((await icon.boundingBox())!.width * uiHeight) / screen.height);
}

/** Paste and workspace-file import live behind the window's Import button. */
async function openWorkspaceMenu(page: Page) {
  const button = page.getByRole("button", { name: "Import", exact: true });
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
}

/** The selected aura's state code and file exports live behind the list's Export button. */
async function openExport(page: Page) {
  const button = page.getByRole("button", { name: "Export", exact: true });
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
}

/** Saves the selected aura as a .txt file from the Export popover. */
async function saveAuraFile(page: Page) {
  await openExport(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save as file" }).click();
  return download;
}

/** The workspace panel's Load button. */
const loadButton = (page: Page) =>
  page.getByRole("region", { name: "Workspace", exact: true }).getByRole("button", { name: "Load" });

async function expectIconSize(page: Page, size: number, id?: string) {
  await expect.poll(() => iconSize(page, id), { timeout: 60_000 }).toBe(size);
}

/** The page's stored workspace JSON (IndexedDB), or null while nothing is stored. */
async function stored(page: Page, workspace: string): Promise<string | null> {
  return page.evaluate(
    (key) =>
      new Promise<string | null>((resolve) => {
        // Open at the app's version so a missing database is created exactly as the app would.
        const open = indexedDB.open("aura-simulator-game-workspaces", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("workspaces");
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction("workspaces").objectStore("workspaces").get(key);
          get.onsuccess = () => {
            resolve(typeof get.result === "string" ? get.result : null);
            db.close();
          };
          get.onerror = () => resolve(null);
        };
      }),
    `aura-simulator:forever:workspace:${workspace}`,
  );
}

/** Asserts the address names the workspace and nothing else. */
function expectAddress(page: Page, workspace: string) {
  const url = new URL(page.url());
  expect(url.pathname).toBe("/forever");
  expect(url.search).toBe(`?w=${workspace}`);
}

test("paste a state code, reload, and the same aura comes back from browser storage; bad codes change nothing", async ({
  page,
  request,
}) => {
  const workspace = uniqueId("paste");
  const code = await encode(request, iconAura("Pasted", 40));

  await page.goto(`/forever?w=${workspace}`);
  await expectIconSize(page, 64); // the sample
  await expect(page.getByTestId("workspace-id")).toHaveText(workspace);

  await openWorkspaceMenu(page);
  await page.getByLabel("Paste a code to load").fill(code);
  await loadButton(page).click();
  await expectIconSize(page, 40);
  await expect.poll(() => stateCode(page)).toBe(code);
  expectAddress(page, workspace);

  await openWorkspaceMenu(page);
  await page.getByLabel("Paste a code to load").fill("!WA:2!garbage");
  await loadButton(page).click();
  await expect(page.getByText("Could not import that")).toBeVisible();
  await expect.poll(() => stateCode(page)).toBe(code);
  await expect(page.getByLabel("Paste a code to load")).toHaveValue("!WA:2!garbage");

  await expect.poll(async () => JSON.parse((await stored(page, workspace)) ?? "{}")).toMatchObject({
    version: 3,
    game: "forever",
    items: [{ aura: { id: "Pasted", width: 40 }, code }],
  });
  await page.reload();
  await expectIconSize(page, 40);
  await expect.poll(() => stateCode(page)).toBe(code);
  expectAddress(page, workspace);
});

test("an agent pushes a document over HTTP and the open page shows it", async ({ page, request, baseURL }) => {
  const workspace = uniqueId("push");
  await page.goto(`/forever?w=${workspace}`);
  await expectIconSize(page, 64);
  // Let the page subscribe to its workspace before pushing.
  await expect.poll(async () => (await (await request.get(`/api/forever/workspaces/${workspace}`)).json()).code).toMatch(/^!WA:2!/);

  const res = await request.post(`/api/forever/workspaces/${workspace}/aura`, { data: { aura: iconAura("Pushed", 52) } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.workspace).toBe(workspace);
  expect(body.code).toMatch(/^!WA:2![A-Za-z0-9()]+$/);
  expect(body.url).toBe(`${baseURL}/forever?w=${workspace}`);
  expect(body.validation).toBeTruthy();

  // The pushed aura joins the workspace beside the sample and is selected; the address stays the workspace.
  await expectIconSize(page, 52, "Pushed");
  await expectIconSize(page, 64, "Arcane Intellect");
  await expect.poll(() => stateCode(page)).toBe(body.code);
  expectAddress(page, workspace);
  expect((await (await request.get(`/api/forever/workspaces/${workspace}`)).json()).code).toBe(body.code);

  // Pushing the same id again replaces it instead of adding another.
  const again = await request.post(`/api/forever/workspaces/${workspace}/aura`, { data: { aura: iconAura("Pushed", 30) } });
  expect(again.status()).toBe(200);
  await expectIconSize(page, 30, "Pushed");
  await expect(page.getByRole("treeitem")).toHaveCount(2);

  const bad = await request.post(`/api/forever/workspaces/${workspace}/aura`, { data: { code: "!WA:2!nope" } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error).toBeTruthy();
});

test("an agent in the browser tab loads auras and reads the state code through window.auraSimulator", async ({ page, request }) => {
  const workspace = uniqueId("page-api");
  await page.goto(`/forever?w=${workspace}`);
  await expectIconSize(page, 64);

  // A document, as the agent docs show it: it joins the workspace (like a push) and is selected.
  const loaded = await page.evaluate((aura) => window.auraSimulator!.load({ aura }), iconAura("Loaded", 40));
  expect(loaded).toMatchObject({ ok: true, id: "Loaded", code: expect.stringMatching(/^!WA:2!/) });
  await expectIconSize(page, 40, "Loaded");
  expect(await page.evaluate(() => window.auraSimulator!.code())).toBe(loaded.ok && loaded.code);
  expect(await page.evaluate(() => window.auraSimulator!.state()?.aura.width)).toBe(40);
  expect(await page.evaluate(() => window.auraSimulator!.workspaceId)).toBe(workspace);

  // A state code with the same uid replaces it in place.
  const code = await encode(request, iconAura("Loaded", 36));
  expect(await page.evaluate((c) => window.auraSimulator!.load(c), code)).toMatchObject({ ok: true, code });
  await expectIconSize(page, 36, "Loaded");
  await expect(page.getByRole("treeitem")).toHaveCount(2);

  // Bad input changes nothing and says why.
  expect(await page.evaluate(() => window.auraSimulator!.load("!WA:2!nope"))).toMatchObject({ ok: false, error: expect.any(String) });
  expect(await page.evaluate(() => window.auraSimulator!.load({ aura: 5 }))).toMatchObject({ ok: false, error: /aura/ });
  expect(await stateCode(page)).toBe(code);
});

test("export an aura as a .txt file holding exactly its code, and import it into a fresh workspace", async ({ page, browser }) => {
  await page.goto(`/forever?w=${uniqueId("export")}`);
  await expectIconSize(page, 64);
  const code = await stateCode(page);

  const file = await saveAuraFile(page);
  expect(file.suggestedFilename()).toBe("Arcane Intellect.txt");
  const path = await file.path();
  expect(await readFile(path, "utf8")).toBe(code);

  // Beside it, the same aura as wago JSON in wago's Editor form.
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save as .json" }).click();
  const json = await jsonDownload;
  expect(json.suggestedFilename()).toBe("Arcane Intellect.json");
  // What the code holds: the aura, sent by the default addon version (Musca 1.15.0 is WeakAuras 5.22.0) as 1421.
  const state = (await page.evaluate(() => window.auraSimulator!.state()))!;
  const expected = toWagoJson({ ...state, senderVersion: "5.22.0", transmissionVersion: 1421 }, { format: "pretty" });
  expect(await readFile(await json.path(), "utf8")).toBe(expected);

  const other = await browser.newContext();
  const fresh = await other.newPage();
  const workspace = uniqueId("import");
  await fresh.goto(`/forever?w=${workspace}`);
  await expectIconSize(fresh, 64);
  await openWorkspaceMenu(fresh);
  await fresh.getByLabel("Import files").setInputFiles(path);
  // The import asks the addon's own import first: the fresh page's full addon VM, loaded on first use.
  await expect(fresh.getByRole("treeitem", { name: "Arcane Intellect 2", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(fresh.getByRole("treeitem", { name: "Arcane Intellect 2", exact: true })).toHaveAttribute("aria-selected", "true");
  // The same aura (only its id made unique): the file's code decodes to the sample's document.
  await fresh.getByRole("treeitem", { name: "Arcane Intellect", exact: true }).click();
  await expect.poll(() => stateCode(fresh)).toBe(code);
  expectAddress(fresh, workspace);
  await other.close();
});

test("drop text files with codes (several per file) on the window to import them", async ({ page, request }) => {
  const workspace = uniqueId("drop");
  const a = await encode(request, iconAura("Dropped A", 30));
  const b = await encode(request, iconAura("Dropped B", 34, { uid: "E2eDropB" }));
  await page.goto(`/forever?w=${workspace}`);
  await expectIconSize(page, 64);

  const dataTransfer = await page.evaluateHandle(
    ([text, bad]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], "two auras.txt", { type: "text/plain" }));
      dt.items.add(new File([bad], "notes.txt", { type: "text/plain" }));
      return dt;
    },
    [`${a}\n${b}\n`, "no codes here"] as const,
  );
  // Dropped anywhere on the window.
  const optionsWindow = page.getByRole("region", { name: "Musca Auras options" });
  await optionsWindow.dispatchEvent("dragenter", { dataTransfer });
  await optionsWindow.dispatchEvent("dragover", { dataTransfer });
  await optionsWindow.dispatchEvent("drop", { dataTransfer });

  await expectIconSize(page, 30, "Dropped A");
  await expectIconSize(page, 34, "Dropped B");
  await expect(page.getByRole("treeitem")).toHaveCount(3);
  await expect(page.getByText("Could not read notes.txt")).toBeVisible();
  expectAddress(page, workspace);
});

test("a 3 MB aura round-trips through push, storage and export without touching the address", async ({ page, request }) => {
  test.setTimeout(300_000);
  const workspace = uniqueId("big");
  await page.goto(`/forever?w=${workspace}`);
  await expectIconSize(page, 64);
  await expect.poll(async () => (await (await request.get(`/api/forever/workspaces/${workspace}`)).json()).code).toMatch(/^!WA:2!/);

  // Incompressible custom text, so the state code itself stays megabytes.
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let desc = "";
  for (let i = 0; i < 3_000_000; i++) desc += alphabet[Math.floor(Math.random() * alphabet.length)];
  const res = await request.post(`/api/forever/workspaces/${workspace}/aura`, {
    data: { aura: iconAura("Big", 46, { uid: "E2eBig", desc }) },
    timeout: 120_000,
  });
  expect(res.status()).toBe(200);
  const { code } = (await res.json()) as { code: string };
  expect(code.length).toBeGreaterThan(2_000_000);

  await expectIconSize(page, 46, "Big");
  await openExport(page);
  await expect(page.getByRole("heading", { name: "State code of Big" })).toBeVisible({ timeout: 120_000 });
  expect(await stateCode(page)).toBe(code);
  expectAddress(page, workspace);

  // Stored in IndexedDB (well past localStorage's ~5 MB once the document is included).
  await expect
    .poll(async () => (await stored(page, workspace))?.includes(code) ?? false, { timeout: 60_000 })
    .toBe(true);

  expect(await readFile(await (await saveAuraFile(page)).path(), "utf8")).toBe(code);

  // And it comes back after a reload, from storage.
  await page.reload();
  await expectIconSize(page, 46, "Big");
  await expect.poll(() => stateCode(page), { timeout: 120_000 }).toBe(code);
  expectAddress(page, workspace);
});

test("agent docs explain the document, the push API and the worked examples, as a page and as Markdown", async ({ page, request }) => {
  const md = await (await request.get("/forever/llms.txt")).text();
  expect(md).toContain("POST /api/forever/workspaces/<id>/aura");
  expect(md).toContain("curl -s -X POST");
  expect(md).toContain("## Worked examples");
  expect(await (await request.get("/forever/docs/agents.md")).text()).toBe(md);

  await page.goto("/forever/docs/agents");
  await expect(page.getByRole("heading", { name: "The aura document" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "POST /api/forever/workspaces/<id>/aura" })).toBeVisible();
  await expect(page.getByText("curl -s -X POST").first()).toBeVisible();
});
