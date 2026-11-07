/**
 * Showing an aura working without clicking (story: an outside agent proves its aura does what was asked): the push
 * answer's `preview`, the situation set over HTTP (`PUT /api/<game>/workspaces/<id>/situation`), which open pages
 * follow, and `window.auraSimulator.situation`/`preview` in the page.
 */
import { expect, test } from "@playwright/test";
import { tbcBuffMissing } from "@/games/tbc/examples";

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test("an agent sets the situation over HTTP: the answer previews the aura in it and the open page follows", async ({ page, request }) => {
  test.setTimeout(180_000);
  const workspace = uniqueId("situation-api");
  const pushed = await request.post(`/api/tbc/workspaces/${workspace}/aura`, { data: { aura: tbcBuffMissing } });
  expect(pushed.status(), await pushed.text()).toBe(200);
  // The default situation has the buff up: the "missing" aura isn't shown.
  expect((await pushed.json()).preview.displays).toEqual([expect.objectContaining({ id: "Arcane Intellect missing", shown: false })]);

  await page.goto(`/tbc?w=${workspace}`);
  const panel = page.getByRole("region", { name: "Situation" });
  await expect(panel).toBeVisible({ timeout: 90_000 });
  await expect(panel.getByRole("checkbox", { name: "Aura present" })).toBeChecked();
  // Time left reads plainly (not "45.0s", whose point the panel's font hides).
  await expect(panel.getByRole("status")).toHaveText("45s");
  const icon = page.getByTestId("aura-preview").locator('[data-region-type="icon"]');
  await expect(icon).toHaveCount(0);

  const set = await request.put(`/api/tbc/workspaces/${workspace}/situation`, { data: { triggers: { "1": { present: false } } } });
  expect(set.status(), await set.text()).toBe(200);
  const answer = await set.json();
  expect(answer).toMatchObject({ workspace, set: true, situation: { targetExists: true, inCombat: false } });
  expect(answer.preview.displays[0]).toMatchObject({ shown: true, glows: [{ subRegion: 2, lit: true }] });
  await expect(panel.getByRole("checkbox", { name: "Aura present" })).not.toBeChecked();
  await expect(icon).toBeVisible();

  // A later push answers in the situation that was set; GET reads it back.
  const again = await request.post(`/api/tbc/workspaces/${workspace}/aura`, { data: { aura: tbcBuffMissing } });
  expect((await again.json()).preview.displays[0].shown).toBe(true);
  expect((await (await request.get(`/api/tbc/workspaces/${workspace}/situation`)).json()).situation.triggers).toEqual({
    "1": { present: false, remaining: 45, duration: 60, stacks: 0 },
  });

  // A page opened later starts in it too.
  const late = await page.context().newPage();
  await late.goto(`/tbc?w=${workspace}`);
  await expect(late.getByRole("region", { name: "Situation" }).getByRole("checkbox", { name: "Aura present" })).not.toBeChecked({ timeout: 90_000 });
  await late.close();

  // In the page: the same situation form, and the same preview.
  await page.waitForFunction(() => window.auraSimulator);
  const read = await page.evaluate(() => window.auraSimulator!.situation({ triggers: { "1": { present: true } } }));
  expect(read).toMatchObject({ ok: true, situation: { triggers: { "1": { present: true } } } });
  await expect(icon).toHaveCount(0);
  expect(await page.evaluate(() => window.auraSimulator!.preview()?.displays[0].shown)).toBe(false);
  expect(await page.evaluate(() => window.auraSimulator!.situation({ triggers: { "1": { left: 3 } } }))).toMatchObject({ ok: false });
});

test("a situation that isn't one is refused with what is wrong", async ({ request }) => {
  const workspace = uniqueId("situation-bad");
  const bad = async (game: string, body: string) => {
    const res = await request.put(`/api/${game}/workspaces/${workspace}/situation`, { headers: { "Content-Type": "application/json" }, data: Buffer.from(body) });
    expect(res.status()).toBe(400);
    return (await res.json()).error as string;
  };
  expect(await bad("tbc", "{")).toMatch(/Not JSON/);
  expect(await bad("tbc", JSON.stringify({ triggers: { "1": { remaining: -2 } } }))).toMatch(/remaining must be a number/);
  // Only Forever has a combat restriction, so only its situations say when combat started.
  expect(await bad("tbc", JSON.stringify({ inCombat: true, beforeCombat: {} }))).toMatch(/only Forever/);
  const forever = await request.put(`/api/forever/workspaces/${workspace}/situation`, { data: { inCombat: true, beforeCombat: {} } });
  expect(forever.status()).toBe(200);
  expect((await forever.json()).preview).toBeNull(); // nothing pushed there yet
});
