/**
 * The tab sweep at seam B: for every display type the New Aura page offers, opens every tab of the window, expands
 * every section and changes the fields there the way a user would (each kind of field: checkbox, dropdown, media
 * dropdown, slider box, text, colour, multiselect), then checks that no field reports an error and the page logged
 * none. It walks the DOM the editor builds from the addon's option tables, so new addon options are covered too.
 * (Seam A's src/core/options-sweep.test.ts sets every option; this checks the form around them.)
 *
 * `npm run test:e2e` sweeps a few display types per game, which between them show every kind of field and both
 * window layouts (an aura's tabs, a group's); the others are tagged @exhaustive and run in `npm run test:all`.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ownWorkspacePage } from "../support/e2e-workspace";

const TYPES: [string, string][] = [
  ["icon", "Icon"],
  ["aurabar", "Progress Bar"],
  ["text", "Text"],
  ["texture", "Texture"],
  ["progresstexture", "Progress Texture"],
  ["stopmotion", "Stop Motion"],
  ["model", "Model"],
  ["empty", "Empty Base Region"],
  ["group", "Group"],
  ["dynamicgroup", "Dynamic Group"],
];

/** Swept in every run: every kind of field (a bar adds the media dropdowns) and a group's window. */
const REPRESENTATIVE = new Set(["icon", "aurabar", "group"]);

test.use({ actionTimeout: 15_000 });

/** Fields changed per tab: every kind once, then more up to this many. */
const PER_TAB = 14;

const editor = (page: Page) => page.getByRole("region", { name: "Aura options" });

async function idle(page: Page) {
  await page.waitForTimeout(80); // slider boxes and typed values settle (the editor batches slider drags for 50 ms)
  await expect(editor(page)).toHaveAttribute("data-busy", "false", { timeout: 30_000 });
}

/** Problems the page reports, minus missing game art (art comes from the network at runtime and may be absent). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (/Failed to load resource|net::ERR|texture|font load failed|404|ERR_INTERNET/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

async function newAura(page: Page, type: string) {
  await page.getByRole("button", { name: "New Aura" }).click();
  const entry = page.getByRole("region", { name: "New aura" }).locator(`button[data-type="${type}"]`);
  await expect(entry).toBeEnabled({ timeout: 90_000 });
  await entry.click();
  await expect(editor(page).getByRole("tab").first()).toBeVisible({ timeout: 60_000 });
  await idle(page);
}

/** Opens every collapsed section of the tab (section headers with aria-expanded=false). */
async function expandAll(page: Page) {
  for (let round = 0; round < 20; round++) {
    const closed = editor(page).locator('[role="tabpanel"] button[data-section][aria-expanded="false"]');
    if ((await closed.count()) === 0) return;
    await closed.first().click();
    await idle(page);
  }
}

/** Changes one field the way a user would. Returns false when it had nothing to change. */
async function change(page: Page, field: Locator, type: string): Promise<boolean> {
  switch (type) {
    case "toggle": {
      const box = field.getByRole("checkbox").first();
      if (!(await box.isEnabled())) return false;
      await box.click();
      return true;
    }
    case "select": {
      const media = field.getByRole("combobox");
      if ((await media.count()) > 0 && (await media.first().evaluate((e) => e.tagName === "BUTTON"))) {
        if (!(await media.first().isEnabled())) return false;
        await media.first().click();
        const options = field.getByRole("option");
        if ((await options.count()) < 2) return false;
        await options.nth(1).click();
        return true;
      }
      const select = field.locator("select").first();
      if (!(await select.isEnabled())) return false;
      const values = await select.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
      const current = await select.inputValue();
      const other = values.find((v) => v !== current);
      if (!other) return false;
      await select.selectOption(other);
      return true;
    }
    case "range": {
      const box = field.locator('input[type="number"]').first();
      if (!(await box.isEnabled())) return false;
      const current = Number(await box.inputValue());
      await box.fill(String(Number.isFinite(current) ? current + 1 : 1));
      await box.press("Enter");
      return true;
    }
    case "input": {
      const box = field.locator("input, textarea").first();
      if (!(await box.isEnabled())) return false;
      const current = await box.inputValue();
      await box.fill(/^-?\d+(\.\d+)?$/.test(current) ? String(Number(current) + 1) : "5");
      await box.blur();
      return true;
    }
    case "color": {
      const swatch = field.getByRole("button").first();
      if (!(await swatch.isEnabled())) return false;
      await swatch.click();
      const square = page.getByRole("slider", { name: "Saturation and brightness" });
      const box = (await square.boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3);
      await page.keyboard.press("Escape");
      return true;
    }
    case "multiselect": {
      const box = field.getByRole("checkbox").first();
      if ((await box.count()) === 0 || !(await box.isEnabled())) return false;
      await box.click();
      return true;
    }
  }
  return false;
}

const KINDS = ["toggle", "select", "range", "input", "color", "multiselect"];

// Every game: each builds its tabs from its own addon (Musca Auras on /forever, WeakAuras2 on /tbc).
for (const game of ["forever", "tbc"] as const)
for (const [type, label] of TYPES) {
  test(`tab sweep (${game}): ${label}`, { tag: REPRESENTATIVE.has(type) ? [] : ["@exhaustive"] }, async ({ page }) => {
    test.setTimeout(Number(process.env.SWEEP_TIMEOUT ?? 600_000));
    const errors = watchErrors(page);
    await page.goto(ownWorkspacePage(`sweep-${type}`, game));
    await newAura(page, type);

    const tabNames = await editor(page).getByRole("tab").allTextContents();
    if (type === "group" || type === "dynamicgroup") expect(tabNames[0]).toBe("Group");
    const report: string[] = [];
    const changed: string[] = [];
    for (const name of tabNames) {
      const tab = editor(page).getByRole("tab", { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await idle(page);
      await expect(editor(page).getByText(/This tab could not be built/)).toHaveCount(0);
      await expandAll(page);

      // Fields to change: one of each kind first, then the rest in order.
      const fields = await editor(page)
        .locator('[role="tabpanel"] [data-option]')
        .evaluateAll((els, kinds) =>
          els
            .map((e) => ({ path: e.getAttribute("data-option")!, type: e.getAttribute("data-type")! }))
            .filter((f) => kinds.includes(f.type)),
        KINDS);
      const seen = new Set<string>();
      const firsts = fields.filter((f) => !seen.has(f.type) && seen.add(f.type));
      const plan = [...firsts, ...fields.filter((f) => !firsts.includes(f))].slice(0, PER_TAB);

      for (const f of plan) {
        const field = editor(page).locator(`[data-option="${f.path.replace(/"/g, '\\"')}"]`).first();
        if ((await field.count()) === 0 || !(await field.isVisible())) continue; // an earlier change hid it
        if (process.env.SWEEP_LOG) console.log(`sweep ${label} ${name} ${f.path} ${f.type}`);
        if (!(await change(page, field, f.type))) continue;
        changed.push(`${name} ${f.path} (${f.type})`);
        await idle(page);
        const alerts = await editor(page).getByRole("alert").allTextContents();
        if (alerts.length) report.push(`${name} ${f.path} (${f.type}): ${alerts.join(" | ")}`);
      }
    }
    console.log(`${label}: changed ${changed.length} fields on ${tabNames.length} tabs`);
    expect(changed.length).toBeGreaterThan(tabNames.length);
    expect(report).toEqual([]);
    expect(errors).toEqual([]);
  });
}
