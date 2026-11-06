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
  const res = await request.post(`/api/workspaces/${uniqueId("scratch")}/aura`, { data: { aura } });
  expect(res.ok()).toBe(true);
  return (await res.json()).code as string;
}

/** The previewed icon's width in UI units: the mock screen scales UIParent to the browser (as in smoke.spec.ts). */
async function iconSize(page: Page): Promise<number> {
  const preview = page.getByTestId("aura-preview");
  const icon = preview.locator('[data-region-type="icon"] img');
  await expect(icon).toBeVisible({ timeout: 60_000 });
  const screenBox = (await preview.boundingBox())!;
  const iconBox = (await icon.boundingBox())!;
  const uiHeight = Number(await page.getByTestId("mock-screen").getAttribute("data-ui-height"));
  return Math.round((iconBox.width * uiHeight) / screenBox.height);
}

/** The workspace panel's Load button (the addon version picker has one too). */
const loadCode = (page: Page) => page.getByRole("region", { name: "Workspace" }).getByRole("button", { name: "Load" });

async function expectIconSize(page: Page, size: number) {
  await expect.poll(() => iconSize(page), { timeout: 60_000 }).toBe(size);
}

test("paste a state code, reload, and the same aura comes back; bad codes change nothing", async ({ page, request }) => {
  const workspace = uniqueId("paste");
  const code = await encode(request, iconAura("Pasted", 40));

  await page.goto(`/?w=${workspace}`);
  await expectIconSize(page, 64); // the sample
  await expect(page.getByTestId("workspace-id")).toHaveText(workspace);

  await page.getByLabel("Paste a code to load").fill(code);
  await loadCode(page).click();
  await expectIconSize(page, 40);
  await expect(page.getByLabel("State code")).toHaveValue(code);
  await expect(page).toHaveURL(new RegExp(`\\?w=${workspace}&code=!WA:2!`));
  expect(new URL(page.url()).searchParams.get("code")).toBe(code);

  await page.getByLabel("Paste a code to load").fill("!WA:2!garbage");
  await loadCode(page).click();
  await expect(page.getByText("Could not load that state code")).toBeVisible();
  await expect(page.getByLabel("State code")).toHaveValue(code);
  await expect(page.getByLabel("Paste a code to load")).toHaveValue("!WA:2!garbage");

  await page.reload();
  await expectIconSize(page, 40);
  await expect(page.getByLabel("State code")).toHaveValue(code);

  // Without a code in the address, the workspace comes back from browser storage.
  const stored = await page.evaluate((w) => localStorage.getItem(`aura-simulator:workspace:${w}`), workspace);
  expect(JSON.parse(stored!).items[0].code).toBe(code);
  await page.goto(`/?w=${workspace}`);
  await expectIconSize(page, 40);
  await expect(page.getByLabel("State code")).toHaveValue(code);
});

test("an agent pushes a document over HTTP and the open page shows it", async ({ page, request }) => {
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
  expect(body.url).toContain(`?w=${workspace}&code=`);

  await expectIconSize(page, 52);
  await expect(page.getByLabel("State code")).toHaveValue(body.code);
  expect(new URL(page.url()).searchParams.get("code")).toBe(body.code);
  expect((await (await request.get(`/api/workspaces/${workspace}`)).json()).code).toBe(body.code);

  const bad = await request.post(`/api/workspaces/${workspace}/aura`, { data: { code: "!WA:2!nope" } });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).error).toBeTruthy();
});

test("a code too long for the address becomes a short link that restores it exactly", async ({ page, request, browser }) => {
  const noise = Array.from({ length: 3000 }, () => Math.random().toString(36)[2]).join("");
  const code = await encode(request, iconAura("Long", 44, { desc: noise }));
  expect(code.length).toBeGreaterThan(2000);

  await page.goto(`/?w=${uniqueId("long")}`);
  await expectIconSize(page, 64);
  await page.getByLabel("Paste a code to load").fill(code);
  await loadCode(page).click();
  await expectIconSize(page, 44);
  await expect.poll(() => new URL(page.url()).searchParams.get("s")).toMatch(/^[A-Za-z0-9]{8}$/);
  const url = new URL(page.url());
  expect(url.searchParams.has("code")).toBe(false);
  expect(page.url().length).toBeLessThan(200);

  const shortId = url.searchParams.get("s")!;
  expect((await (await request.get(`/api/short-links/${shortId}`)).json()).code).toBe(code);

  // A fresh browser (no storage) opening the short link.
  const other = await browser.newContext();
  const fresh = await other.newPage();
  await fresh.goto(`/?w=${uniqueId("fresh")}&s=${shortId}`);
  await expectIconSize(fresh, 44);
  await expect(fresh.getByLabel("State code")).toHaveValue(code);
  await other.close();
});

test("agent docs explain the document, state codes and the push API, as a page and as Markdown", async ({ page, request }) => {
  const md = await (await request.get("/llms.txt")).text();
  expect(md).toContain("POST /api/workspaces/<id>/aura");
  expect(md).toContain("curl -s -X POST");
  expect(md).toMatch(/!WA:2![A-Za-z0-9()]+/); // the sample, encoded by the addon
  expect(await (await request.get("/docs/agents.md")).text()).toBe(md);

  await page.goto("/docs/agents");
  await expect(page.getByRole("heading", { name: "The aura document" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "POST /api/workspaces/<id>/aura" })).toBeVisible();
  await expect(page.getByText("curl -s -X POST").first()).toBeVisible();
});
