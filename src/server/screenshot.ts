/**
 * Pictures of the render page (`/<game>/render`) taken in a headless Chromium through Playwright: what the screenshot
 * endpoint answers. One browser per server process, started on the first picture and reused; at most
 * `MAX_CONCURRENT` pictures are taken at once, the rest wait their turn. Playwright is a dev dependency, so this works
 * where dev dependencies and Playwright's Chromium are installed (`npm run dev`); elsewhere it says how to install them.
 */
import type { Browser } from "playwright-core";
import { errorMessage } from "@/lib/errors";

/** The browser can't be had here; `message` says how to install it. Answered as 503. */
export class ScreenshotUnavailable extends Error {}

/** The render page reported a problem (its `data-error`), e.g. a picture larger than allowed. Answered as 422. */
export class RenderPageError extends Error {}

const MAX_CONCURRENT = 2;
const PAGE_TIMEOUT_MS = 60_000;
/** What the render page marks itself with (`AuraRender`). */
const ROOT = '[data-testid="aura-render"]';

const INSTALL_PLAYWRIGHT = "npm install --include=dev (Playwright is a dev dependency), then npx playwright install chromium";

const g = globalThis as typeof globalThis & { __renderBrowser?: Promise<Browser>; __renderQueue?: Queue };

async function launch(): Promise<Browser> {
  let playwright: typeof import("playwright-core");
  try {
    playwright = await import("playwright-core");
  } catch (e) {
    throw new ScreenshotUnavailable(`Screenshots need Playwright, which isn't installed here (${errorMessage(e)}). Install it: ${INSTALL_PLAYWRIGHT}.`);
  }
  try {
    return await playwright.chromium.launch();
  } catch (e) {
    const message = errorMessage(e);
    const missing = /Executable doesn't exist|playwright install/i.test(message);
    throw new ScreenshotUnavailable(
      missing
        ? `Screenshots need Playwright's Chromium, which isn't installed. Install it: npx playwright install chromium`
        : `Could not start the headless browser: ${message.split("\n")[0]}`,
    );
  }
}

/** The shared browser; a new one when it was closed or crashed, and another try after a failed start. */
function browser(): Promise<Browser> {
  if (!g.__renderBrowser) {
    const started = launch();
    g.__renderBrowser = started;
    started.then(
      (b) => b.on("disconnected", () => g.__renderBrowser === started && delete g.__renderBrowser),
      () => g.__renderBrowser === started && delete g.__renderBrowser,
    );
  }
  return g.__renderBrowser;
}

/** A counting semaphore: `run` waits while `limit` jobs are running. */
class Queue {
  private running = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly limit: number) {}

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.running++;
    try {
      return await job();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}

/**
 * A PNG of the render page at `url` (absolute, on this server): its picture element once the page marks it ready,
 * transparent where the page has no background, CSS animations stopped.
 */
export function captureRenderPage(url: string): Promise<Buffer> {
  const queue = (g.__renderQueue ??= new Queue(MAX_CONCURRENT));
  return queue.run(async () => {
    const context = await (await browser()).newContext({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      await page.goto(url, { timeout: PAGE_TIMEOUT_MS });
      const root = page.locator(`${ROOT}[data-ready], [data-render-error]`).first();
      await root.waitFor({ timeout: PAGE_TIMEOUT_MS });
      const problem = await root.getAttribute("data-render-error");
      if (problem !== null) throw new RenderPageError(problem);
      const width = Number(await root.getAttribute("data-width"));
      const height = Number(await root.getAttribute("data-height"));
      await page.setViewportSize({ width: Math.max(1, width), height: Math.max(1, height) });
      return await root.screenshot({ type: "png", omitBackground: true, animations: "disabled", timeout: PAGE_TIMEOUT_MS });
    } finally {
      await context.close().catch(() => {});
    }
  });
}
