import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Opens a toolbar or list popover (Import, Export) unless it is open already. */
async function openPopover(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
}
/** Paste and workspace-file import live behind the window's Import button. */
const openWorkspaceMenu = (page: Page) => openPopover(page, "Import");
/** The selected item's state code and the workspace file export live behind the list's Export button. */
const openExport = (page: Page) => openPopover(page, "Export");

/** New Aura, then a display type from the chooser ("Icon", "Group", "Dynamic Group"). */
async function newItem(page: Page, type: string) {
  await page.getByRole("button", { name: "New Aura" }).click();
  await page.getByRole("region", { name: "New aura" }).getByRole("button", { name: new RegExp(`^${type} `) }).click();
}

const row = (page: Page, id: string) => page.getByRole("treeitem", { name: id, exact: true });
const region = (page: Page, id: string) => page.getByTestId("aura-preview").locator(`[data-aura-id="${id}"]`);

/** The tree as "level:id" lines, in order. */
async function treeShape(page: Page): Promise<string[]> {
  const rows = page.getByRole("treeitem");
  return rows.evaluateAll((els) => els.map((el) => `${el.getAttribute("aria-level")}:${el.getAttribute("aria-label")}`));
}

async function box(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: 60_000 });
  return (await locator.boundingBox())!;
}

async function openFresh(page: Page, prefix: string) {
  await page.goto(`/?w=${uniqueId(prefix)}`);
  await expect(row(page, "Arcane Intellect")).toBeVisible({ timeout: 60_000 }); // the sample
}

test("build a group with two auras, see both laid out, and paste its code into a fresh workspace", async ({ page, browser }) => {
  await openFresh(page, "group");

  // A new group next to the sample, the sample moved into it, and a new aura added beside it in the group.
  await newItem(page, "Group");
  await expect(row(page, "New Group")).toHaveAttribute("aria-selected", "true");
  await row(page, "Arcane Intellect").click();
  await page.getByLabel("Move to group").selectOption("New Group");
  await newItem(page, "Icon");
  await expect(row(page, "New")).toHaveAttribute("aria-selected", "true");

  // Rename the group: the children follow.
  await row(page, "New Group").click();
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("New name").fill("Buffs");
  await page.getByLabel("New name").press("Enter");
  expect(await treeShape(page)).toEqual(["1:Buffs", "2:Arcane Intellect", "2:New"]);

  // The stage shows both auras at once, the second 64 + 4 units right of the first, and outlines the group.
  const a = await box(region(page, "Arcane Intellect"));
  const b = await box(region(page, "New"));
  expect(b.y).toBeCloseTo(a.y, 0);
  expect((b.x - a.x) / a.width).toBeCloseTo(68 / 64, 2);
  await expect(page.getByTestId("selection-box")).toHaveAttribute("data-selected-id", "Buffs");
  const sel = await box(page.getByTestId("selection-box"));
  expect(sel.width).toBeCloseTo(b.x + b.width - a.x, 0);

  // The group's state code holds both auras.
  await openExport(page);
  await expect(page.getByRole("heading", { name: "State code of Buffs" })).toBeVisible();
  const code = await page.getByLabel("State code").inputValue();
  expect(code).toMatch(/^!WA:2!/);

  // A fresh browser: paste the group code, and the same tree comes back.
  const other = await browser.newContext();
  const fresh = await other.newPage();
  await openFresh(fresh, "paste-group");
  await openWorkspaceMenu(fresh);
  await fresh.getByLabel("Paste a code to load").fill(code);
  await fresh.getByRole("region", { name: "Workspace", exact: true }).getByRole("button", { name: "Load" }).click();
  await expect.poll(() => treeShape(fresh)).toEqual(["1:Buffs", "2:Arcane Intellect", "2:New"]);
  await expect(fresh.getByLabel("State code")).toHaveValue(code);
  const a2 = await box(region(fresh, "Arcane Intellect"));
  const b2 = await box(region(fresh, "New"));
  expect((b2.x - a2.x) / a2.width).toBeCloseTo(68 / 64, 2);

  // "Add to workspace" adds it once more as a subtree, with ids made unique the addon's way.
  await openWorkspaceMenu(fresh);
  await fresh.getByLabel("Paste a code to load").fill(code);
  await fresh.getByRole("button", { name: "Add to workspace" }).click();
  await expect
    .poll(() => treeShape(fresh))
    .toEqual(["1:Buffs", "2:Arcane Intellect", "2:New", "1:Buffs 2", "2:Arcane Intellect 2", "2:New 2"]);
  await other.close();
});

test("a pushed dynamic group appears as a subtree; hidden children close up", async ({ page, request }) => {
  const workspace = uniqueId("dyn");
  await page.goto(`/?w=${workspace}`);
  await expect(row(page, "Arcane Intellect")).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await (await request.get(`/api/workspaces/${workspace}`)).json()).code).toMatch(/^!WA:2!/);

  const icon = (id: string) => ({
    id,
    uid: `Dyn${id}`,
    regionType: "icon",
    displayIcon: 135932,
    width: 40,
    height: 40,
    anchorPoint: "CENTER",
    selfPoint: "CENTER",
    anchorFrameType: "SCREEN",
    xOffset: 0,
    yOffset: 0,
    triggers: { "[1]": { trigger: { type: "secretAura", unit: "player", auraspellids: ["1459"] }, untrigger: {} } },
  });
  const group = {
    id: "Row",
    uid: "DynRow",
    regionType: "dynamicgroup",
    grow: "RIGHT",
    selfPoint: "LEFT",
    align: "CENTER",
    space: 10,
    anchorPoint: "CENTER",
    anchorFrameType: "SCREEN",
    xOffset: 0,
    yOffset: 200,
  };
  const res = await request.post(`/api/workspaces/${workspace}/aura`, {
    data: { aura: group, children: [icon("One"), icon("Two"), icon("Three")] },
  });
  expect(res.status()).toBe(200);
  await expect.poll(() => treeShape(page)).toEqual(["1:Arcane Intellect", "1:Row", "2:One", "2:Two", "2:Three"]);

  const one = await box(region(page, "One"));
  const three = await box(region(page, "Three"));
  const unit = one.width / 40;
  expect((three.x - one.x) / unit).toBeCloseTo(100, 0); // 2 * (40 + 10)

  await page.getByRole("button", { name: "Hide Two" }).click();
  await expect(region(page, "Two")).toHaveCount(0);
  await expect.poll(async () => ((await box(region(page, "Three"))).x - one.x) / unit).toBeCloseTo(50, 0);
});

test("workspace file export and import round trip", async ({ page, browser }) => {
  await openFresh(page, "file");
  await newItem(page, "Dynamic Group");
  await newItem(page, "Icon");
  await newItem(page, "Icon");
  const shape = ["1:Arcane Intellect", "1:New Dynamic Group", "2:New", "2:New 2"];
  await expect.poll(() => treeShape(page)).toEqual(shape);

  const download = page.waitForEvent("download");
  await openExport(page);
  await page.getByRole("button", { name: "Export workspace file" }).click();
  const file = await (await download).path();
  const exported = JSON.parse(await readFile(file, "utf8"));
  expect(exported).toMatchObject({ format: "aura-simulator/workspace", version: 2 });
  expect(exported.items[1].aura.controlledChildren).toEqual(["New", "New 2"]);
  expect(exported.items[1].items[0].aura.parent).toBe("New Dynamic Group");
  expect(JSON.stringify(exported)).not.toMatch(/data:image|base64/);

  // A fresh browser with only the sample: importing asks, then replaces.
  const other = await browser.newContext();
  const fresh = await other.newPage();
  await openFresh(fresh, "file-import");
  await openWorkspaceMenu(fresh);
  await fresh.getByLabel("Import files").setInputFiles(file);
  await fresh.getByRole("button", { name: "Replace workspace" }).click();
  await expect.poll(() => treeShape(fresh)).toEqual(shape);

  // Exporting again gives the same items: lossless.
  const download2 = fresh.waitForEvent("download");
  await openExport(fresh);
  await fresh.getByRole("button", { name: "Export workspace file" }).click();
  const again = JSON.parse(await readFile(await (await download2).path(), "utf8"));
  expect(again.items).toEqual(exported.items);

  // A broken file changes nothing and says why.
  await openWorkspaceMenu(fresh);
  await fresh.getByLabel("Import files").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "aura-simulator/workspace", version: 2, items: [{ aura: { regionType: "icon" } }] })),
  });
  await expect(fresh.getByText("Could not read broken.json")).toBeVisible();
  expect(await treeShape(fresh)).toEqual(shape);
  await other.close();
});
