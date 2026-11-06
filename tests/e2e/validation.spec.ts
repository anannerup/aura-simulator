import { expect, test, type APIRequestContext } from "@playwright/test";
import { modernDesaturateBad, modernGlowOk } from "../fixtures/auras";

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Pushes an aura to a fresh workspace and returns the workspace ID. */
async function pushAura(request: APIRequestContext, aura: object): Promise<string> {
  const workspace = uniqueId("checks");
  const res = await request.post(`/api/workspaces/${workspace}/aura`, { data: { aura } });
  expect(res.ok()).toBe(true);
  return workspace;
}

test("a remaining-time condition driving desaturate is flagged, pointing at the change", async ({ page, request }) => {
  const workspace = await pushAura(request, modernDesaturateBad);
  await page.goto(`/?w=${workspace}`);
  const panel = page.getByTestId("validation-panel");
  await expect(panel).toHaveAttribute("data-state", "done", { timeout: 90_000 });
  await expect(panel).toHaveAttribute("data-combat-status", "broken");
  await expect(panel.getByTestId("combat-status")).toContainText("Won't work");
  const error = panel.locator('li[data-code="modern.invalid"]');
  await expect(error).toContainText("Choose a supported property for this Aura (Modern) condition.");
  await expect(error).toContainText("Condition 1, change 1 (desaturate)");
  // never blocks export
  await expect(page.getByRole("textbox", { name: "State code" })).toHaveValue(/^!WA:2!/);
  console.log(`full addon VM load in the browser (ms): ${await panel.getAttribute("data-vm-timings")}`);
});

test("a known-good Aura (Modern) is fully usable in combat", async ({ page, request }) => {
  const workspace = await pushAura(request, modernGlowOk);
  await page.goto(`/?w=${workspace}`);
  const panel = page.getByTestId("validation-panel");
  await expect(panel).toHaveAttribute("data-combat-status", "ok", { timeout: 90_000 });
  await expect(panel.getByTestId("combat-status")).toContainText("Fully usable in combat.");
  await expect(panel.locator('li[data-severity="error"]')).toHaveCount(0);
});
