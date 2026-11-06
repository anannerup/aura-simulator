import { expect, test, type Page } from "@playwright/test";
import { ownWorkspacePage } from "../support/e2e-workspace";

/** Loads the page and waits until the light core and the full addon VM (validation) are both done. */
async function loadFully(page: Page) {
  await page.goto(ownWorkspacePage("bundle"));
  await expect(page.getByTestId("addon-loaded")).toContainText("Musca Auras v1.15.0", { timeout: 60_000 });
  await expect(page.getByTestId("validation-panel")).toHaveAttribute("data-state", "done", { timeout: 60_000 });
}

function addonRequests(page: Page) {
  const seen = { bundle: [] as string[], file: [] as string[], jsDelivr: [] as string[] };
  page.on("request", (r) => {
    const url = r.url();
    if (/\/api\/addon\/[^/]+\/bundle\?/.test(url)) seen.bundle.push(url);
    if (/\/api\/addon\/[^/]+\/files?[?/]/.test(url)) seen.file.push(url);
    if (url.includes("cdn.jsdelivr.net/gh/")) seen.jsDelivr.push(url);
  });
  return seen;
}

test("the page loads the whole addon with one bundle request and no per-file requests", async ({ page }) => {
  const seen = addonRequests(page);
  await loadFully(page);
  expect(seen.bundle).toHaveLength(1);
  expect(seen.bundle[0]).toContain("/api/addon/v1.15.0/bundle?set=full");
  expect(seen.file).toEqual([]);
  expect(seen.jsDelivr).toEqual([]);
});

test("a repeat visit takes the bundle from Cache Storage", async ({ page }) => {
  await loadFully(page);
  const seen = addonRequests(page);
  await loadFully(page);
  expect(seen.bundle).toEqual([]);
  expect(seen.file).toEqual([]);
});

test("when the bundle route fails, files are fetched one by one", async ({ page }) => {
  await page.route("**/api/addon/*/bundle?*", (route) => route.abort());
  const seen = addonRequests(page);
  await loadFully(page);
  expect(seen.file.some((u) => u.includes("WeakAuras%2FInit.lua"))).toBe(true);
  expect(seen.file.some((u) => u.includes("WeakAurasOptions%2FWeakAurasOptions.toc"))).toBe(true);
});

test("the bundle endpoint: light and full sets, immutable, ETag and 304, gzip format", async ({ request }) => {
  const light = await request.get("/api/addon/v1.15.0/bundle?set=light");
  expect(light.status()).toBe(200);
  expect(light.headers()["cache-control"]).toContain("immutable");
  const body = (await light.json()) as { ref: string; set: string; files: Record<string, string> };
  expect(body.ref).toBe("v1.15.0");
  expect(body.set).toBe("light");
  expect(Object.keys(body.files)).toContain("WeakAuras/Transmission.lua");
  expect(Object.keys(body.files)).toHaveLength(6);

  const etag = light.headers()["etag"];
  expect(etag).toMatch(/^"[A-Za-z0-9_-]+"$/);
  const again = await request.get("/api/addon/v1.15.0/bundle?set=light", { headers: { "If-None-Match": etag } });
  expect(again.status()).toBe(304);

  const full = await request.get("/api/addon/1.15.0/bundle?set=full&format=gzip");
  expect(full.status()).toBe(200);
  expect(full.headers()["content-type"]).toBe("application/gzip");
  expect(full.headers()["x-addon-ref"]).toBe("v1.15.0");

  expect((await request.get("/api/addon/v1.15.0/bundle?set=everything")).status()).toBe(400);
  expect((await request.get("/api/addon/v1.15.0/bundle?set=full&format=zip")).status()).toBe(400);
});
