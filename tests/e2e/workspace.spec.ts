import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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
  const res = await request.post(`/api/workspaces/${uniqueId("scratch")}/aura?validate=false`, { data: { aura } });
  expect(res.ok()).toBe(true);
  return (await res.json()).code as string;
}

async function iconSize(page: Page, id?: string): Promise<number> {
  const which = id ? `[data-aura-id="${id}"]` : "";
  const icon = page.getByTestId("aura-preview").locator(`[data-region-type="icon"]${which} img`);
  await expect(icon).toBeVisible({ timeout: 60_000 });
  // In UI units: the mock screen scales UI units to the browser.
  const screen = (await page.getByTestId("aura-preview").boundingBox())!;
  const uiHeight = Number(await page.getByTestId("mock-screen").getAttribute("data-ui-height"));
  return Math.round(((await icon.boundingBox())!.width * uiHeight) / screen.height);
}

/** The workspace panel's Load button (the addon version picker has one too). */
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
        const open = indexedDB.open("aura-simulator-workspaces", 1);
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
    `aura-simulator:workspace:${workspace}`,
  );
}

/** Asserts the address names the workspace and nothing else. */
function expectAddress(page: Page, workspace: string) {
  const url = new URL(page.url());
  expect(url.pathname).toBe("/");
  expect(url.search).toBe(`?w=${workspace}`);
}

test("paste a state code, reload, and the same aura comes back from browser storage; bad codes change nothing", async ({
  page,
  request,
}) => {
  const workspace = uniqueId("paste");
  const code = await encode(request, iconAura("Pasted", 40));

  await page.goto(`/?w=${workspace}`);
  await expectIconSize(page, 64); // the sample
  await expect(page.getByTestId("workspace-id")).toHaveText(workspace);

  await page.getByLabel("Paste a code to load").fill(code);
  await loadButton(page).click();
  await expectIconSize(page, 40);
  await expect(page.getByLabel("State code")).toHaveValue(code);
  expectAddress(page, workspace);

  await page.getByLabel("Paste a code to load").fill("!WA:2!garbage");
  await loadButton(page).click();
  await expect(page.getByText("Could not load that state code")).toBeVisible();
  await expect(page.getByLabel("State code")).toHaveValue(code);
  await expect(page.getByLabel("Paste a code to load")).toHaveValue("!WA:2!garbage");

  await expect.poll(async () => JSON.parse((await stored(page, workspace)) ?? "{}")).toMatchObject({
    version: 2,
    items: [{ aura: { id: "Pasted", width: 40 }, code }],
  });
  await page.reload();
  await expectIconSize(page, 40);
  await expect(page.getByLabel("State code")).toHaveValue(code);
  expectAddress(page, workspace);
});

test("a workspace saved in localStorage by an older version moves to IndexedDB", async ({ page, request }) => {
  const workspace = uniqueId("migrate");
  const code = await encode(request, iconAura("Old", 36));
  const key = `aura-simulator:workspace:${workspace}`;
  const old = JSON.stringify({ format: "aura-simulator/workspace", version: 1, updatedAt: new Date().toISOString(), items: [{ code }] });
  await page.addInitScript(([k, v]) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem(k, v);
      sessionStorage.setItem("seeded", "1");
    }
  }, [key, old] as const);
  await page.goto(`/?w=${workspace}`);
  await expectIconSize(page, 36);
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  expect(JSON.parse((await stored(page, workspace))!)).toMatchObject({ version: 2, items: [{ aura: { id: "Old" } }] });
});

test("an old ?code= link is imported once and stripped from the address", async ({ page, request }) => {
  const workspace = uniqueId("legacy");
  const code = await encode(request, iconAura("Linked", 42));
  await page.goto(`/?w=${workspace}&code=${encodeURIComponent(code)}`);
  await expectIconSize(page, 42);
  await expect(page.getByLabel("State code")).toHaveValue(code);
  await expect.poll(() => new URL(page.url()).search).toBe(`?w=${workspace}`);

  // Short links are gone: the page says so and carries on.
  await page.goto(`/?w=${workspace}&s=Ab12Cd34`);
  await expect(page.getByText("Short links are no longer supported")).toBeVisible({ timeout: 60_000 });
  await expectIconSize(page, 42);
  await expect.poll(() => new URL(page.url()).search).toBe(`?w=${workspace}`);
});

test("an agent pushes a document over HTTP and the open page shows it", async ({ page, request, baseURL }) => {
  const workspace = uniqueId("push");
  await page.goto(`/?w=${workspace}`);
  await expectIconSize(page, 64);
  // Let the page subscribe to its workspace before pushing.
  await expect.poll(async () => (await (await request.get(`/api/workspaces/${workspace}`)).json()).code).toMatch(/^!WA:2!/);

  const res = await request.post(`/api/workspaces/${workspace}/aura`, { data: { aura: iconAura("Pushed", 52) } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.workspace).toBe(workspace);
  expect(body.code).toMatch(/^!WA:2![A-Za-z0-9()]+$/);
  expect(body.url).toBe(`${baseURL}/?w=${workspace}`);
  expect(body.validation).toBeTruthy();

  // The pushed aura joins the workspace beside the sample and is selected; the address stays the workspace.
  await expectIconSize(page, 52, "Pushed");
  await expectIconSize(page, 64, "Arcane Intellect");
  await expect(page.getByLabel("State code")).toHaveValue(body.code);
  expectAddress(page, workspace);
  expect((await (await request.get(`/api/workspaces/${workspace}`)).json()).code).toBe(body.code);

  // Pushing the same id again replaces it instead of adding another.
  const again = await request.post(`/api/workspaces/${workspace}/aura`, { data: { aura: iconAura("Pushed", 30) } });
  expect(again.status()).toBe(200);
  await expectIconSize(page, 30, "Pushed");
  await expect(page.getByRole("treeitem")).toHaveCount(2);

  const bad = await request.post(`/api/workspaces/${workspace}/aura`, { data: { code: "!WA:2!nope" } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error).toBeTruthy();
});

test("export an aura as a .txt file holding exactly its code, and import it into a fresh workspace", async ({ page, browser }) => {
  await page.goto(`/?w=${uniqueId("export")}`);
  await expectIconSize(page, 64);
  const code = await page.getByLabel("State code").inputValue();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export aura file" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Arcane Intellect.txt");
  const path = await file.path();
  expect(await readFile(path, "utf8")).toBe(code);

  const other = await browser.newContext();
  const fresh = await other.newPage();
  const workspace = uniqueId("import");
  await fresh.goto(`/?w=${workspace}`);
  await expectIconSize(fresh, 64);
  await fresh.getByLabel("Import files").setInputFiles(path);
  await expect(fresh.getByRole("treeitem", { name: "Arcane Intellect 2", exact: true })).toBeVisible();
  await expect(fresh.getByRole("treeitem", { name: "Arcane Intellect 2", exact: true })).toHaveAttribute("aria-selected", "true");
  // The same aura (only its id made unique): the file's code decodes to the sample's document.
  await fresh.getByRole("treeitem", { name: "Arcane Intellect", exact: true }).click();
  await expect(fresh.getByLabel("State code")).toHaveValue(code);
  expectAddress(fresh, workspace);
  await other.close();
});

test("drop text files with codes (several per file) on the page to import them", async ({ page, request }) => {
  const workspace = uniqueId("drop");
  const a = await encode(request, iconAura("Dropped A", 30));
  const b = await encode(request, iconAura("Dropped B", 34, { uid: "E2eDropB" }));
  await page.goto(`/?w=${workspace}`);
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
  await page.dispatchEvent("body", "dragenter", { dataTransfer });
  await page.dispatchEvent("body", "dragover", { dataTransfer });
  await page.dispatchEvent("body", "drop", { dataTransfer });

  await expectIconSize(page, 30, "Dropped A");
  await expectIconSize(page, 34, "Dropped B");
  await expect(page.getByRole("treeitem")).toHaveCount(3);
  await expect(page.getByText("Could not read notes.txt")).toBeVisible();
  expectAddress(page, workspace);
});

test("a 3 MB aura round-trips through push, storage and export without touching the address", async ({ page, request }) => {
  test.setTimeout(300_000);
  const workspace = uniqueId("big");
  await page.goto(`/?w=${workspace}`);
  await expectIconSize(page, 64);
  await expect.poll(async () => (await (await request.get(`/api/workspaces/${workspace}`)).json()).code).toMatch(/^!WA:2!/);

  // Incompressible custom text, so the state code itself stays megabytes.
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let desc = "";
  for (let i = 0; i < 3_000_000; i++) desc += alphabet[Math.floor(Math.random() * alphabet.length)];
  const res = await request.post(`/api/workspaces/${workspace}/aura`, {
    data: { aura: iconAura("Big", 46, { uid: "E2eBig", desc }) },
    timeout: 120_000,
  });
  expect(res.status()).toBe(200);
  const { code } = (await res.json()) as { code: string };
  expect(code.length).toBeGreaterThan(2_000_000);

  await expectIconSize(page, 46, "Big");
  await expect(page.getByRole("heading", { name: "State code of Big" })).toBeVisible({ timeout: 120_000 });
  expect(await page.getByLabel("State code").inputValue()).toBe(code);
  expectAddress(page, workspace);

  // Stored in IndexedDB (well past localStorage's ~5 MB once the document is included).
  await expect
    .poll(async () => (await stored(page, workspace))?.includes(code) ?? false, { timeout: 60_000 })
    .toBe(true);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export aura file" }).click();
  expect(await readFile(await (await download).path(), "utf8")).toBe(code);

  // And it comes back after a reload, from storage.
  await page.reload();
  await expectIconSize(page, 46, "Big");
  await expect.poll(() => page.getByLabel("State code").inputValue(), { timeout: 120_000 }).toBe(code);
  expectAddress(page, workspace);
});

test("agent docs explain the document, state codes, files and the push API, as a page and as Markdown", async ({ page, request }) => {
  const md = await (await request.get("/llms.txt")).text();
  expect(md).toContain("POST /api/workspaces/<id>/aura");
  expect(md).toContain("curl -s -X POST");
  expect(md).toContain("aura file");
  expect(md).not.toContain("short-links");
  expect(md).toMatch(/!WA:2![A-Za-z0-9()]+/); // the sample, encoded by the addon
  expect(await (await request.get("/docs/agents.md")).text()).toBe(md);

  await page.goto("/docs/agents");
  await expect(page.getByRole("heading", { name: "The aura document" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "POST /api/workspaces/<id>/aura" })).toBeVisible();
  await expect(page.getByText("curl -s -X POST").first()).toBeVisible();
});
