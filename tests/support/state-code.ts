import type { Page } from "@playwright/test";

/** The selected item's state code, read through the page's documented `window.auraSimulator` (once restored). */
export async function stateCode(page: Page): Promise<string> {
  await page.waitForFunction(() => window.auraSimulator, undefined, { timeout: 60_000 });
  return page.evaluate(() => window.auraSimulator!.code() ?? "");
}
