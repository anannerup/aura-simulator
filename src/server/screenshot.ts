/**
 * Pictures of the render page (`/<game>/render`) taken in a headless Chromium through Playwright: what the screenshot
 * endpoint answers. One browser per server process, started on the first picture and reused; at most
 * `MAX_CONCURRENT` pictures are taken at once, the rest wait their turn. Playwright is a dev dependency, so this works
 * where dev dependencies and Playwright's Chromium are installed (`npm run dev`); elsewhere it says how to install them.
 */
import type { Browser, Locator } from "playwright-core";
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
export async function captureRenderPage(url: string): Promise<Buffer> {
  return (await captureRender(url)).png;
}

/** A box in pixels of the render page's picture. */
export interface PictureBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A drawn element of a region (see `PictureElement` in the compare): its kind, its `subRegions` place, its box. */
export interface RenderedElement {
  kind: string;
  index: number | null;
  box: PictureBox;
  font?: { name: string; size: number; flags: string; shadow: { x: number; y: number } };
}

/** A region the render page drew (the compare endpoint's frames and elements). */
export interface RenderedRegion {
  auraId: string;
  regionType: string;
  box: PictureBox;
  /** Its drawn elements: display elements (not glows, nor hidden texts), and a text display's own text. */
  elements: RenderedElement[];
}

/**
 * A picture page's picture: waits for `root` (an element marking itself `data-ready`, with `data-width`/`data-height`)
 * or a `data-render-error`, takes the picture of `root` (transparent where the page has no background, CSS animations
 * stopped) and whatever `read` reads from the page.
 */
async function capturePicture<T>(url: string, root: string, read: (root: Locator) => Promise<T>): Promise<{ png: Buffer; read: T }> {
  const queue = (g.__renderQueue ??= new Queue(MAX_CONCURRENT));
  return queue.run(async () => {
    const context = await (await browser()).newContext({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      await page.goto(url, { timeout: PAGE_TIMEOUT_MS });
      const picture = page.locator(`${root}[data-ready], [data-render-error]`).first();
      await picture.waitFor({ timeout: PAGE_TIMEOUT_MS });
      const problem = await picture.getAttribute("data-render-error");
      if (problem !== null) throw new RenderPageError(problem);
      const width = Number(await picture.getAttribute("data-width"));
      const height = Number(await picture.getAttribute("data-height"));
      await page.setViewportSize({ width: Math.max(1, width), height: Math.max(1, height) });
      const png = await picture.screenshot({ type: "png", omitBackground: true, animations: "disabled", timeout: PAGE_TIMEOUT_MS });
      return { png, read: await read(picture) };
    } finally {
      await context.close().catch(() => {});
    }
  });
}

/** A PNG of the font sample page at `url` (`/<game>/fonts/sample`, absolute, on this server). */
export async function captureFontSample(url: string): Promise<Buffer> {
  return (await capturePicture(url, '[data-testid="font-sample"]', async () => null)).png;
}

/** The render page's picture (as `captureRenderPage`) and where it drew each region of the aura and its elements. */
export async function captureRender(url: string): Promise<{ png: Buffer; regions: RenderedRegion[] }> {
  const { png, read } = await capturePicture(url, ROOT, (root) =>
    root.evaluate((el): RenderedRegion[] => {
      const origin = el.getBoundingClientRect();
      const box = (e: Element) => {
        const r = e.getBoundingClientRect();
        return { left: Math.round(r.left - origin.left), top: Math.round(r.top - origin.top), width: Math.round(r.width), height: Math.round(r.height) };
      };
      /** A text's font, from the data the renderers put on it (`data-font-name`, …). */
      const font = (e: HTMLElement) => {
        const [x, y] = (e.dataset.fontShadow ?? "0,0").split(",").map(Number);
        return { name: e.dataset.fontName ?? "", size: Number(e.dataset.fontSize ?? 0), flags: e.dataset.fontFlags ?? "None", shadow: { x, y } };
      };
      return Array.from(el.querySelectorAll<HTMLElement>("[data-aura-id]"), (region) => {
        const ownText = region.dataset.regionType === "text" ? region.querySelector<HTMLElement>('[data-testid="text-region"]') : null;
        const subs = Array.from(region.querySelectorAll<HTMLElement>('[data-subregion]:not([data-subregion="subglow"]):not([data-visible="false"])'))
          // Only this region's own elements (a group's children are regions of their own).
          .filter((e) => e.closest("[data-aura-id]") === region);
        return {
          auraId: region.dataset.auraId ?? "",
          regionType: region.dataset.regionType ?? "",
          box: box(region),
          elements: [
            ...(ownText ? [{ kind: "text", index: null, box: box(region), font: font(ownText) }] : []),
            ...subs.map((e) => ({
              kind: e.dataset.subregion ?? "",
              index: e.dataset.index ? Number(e.dataset.index) : null,
              box: box(e),
              ...(e.dataset.subregion === "subtext" && { font: font(e) }),
            })),
          ],
        };
      });
    }),
  );
  return { png, regions: read };
}
