/**
 * Knowing when a drawn screen is complete: every game file (texture, font, icon lookup) it asked for has arrived,
 * every image in it is decoded and the game fonts are in. The render page waits for this before it reports ready.
 */
import { fontsLoading } from "@/render/fonts";
import type { TextureLoader } from "@/render/textures";
import type { PendingWork } from "@/lib/pending";

/** `loader` with every load counted in `pending`. */
export function trackedTextureLoader(loader: TextureLoader, pending: PendingWork): TextureLoader {
  return {
    urls: loader.urls,
    loadBytes: (source) => pending.track(loader.loadBytes(source)),
    load: (source) => pending.track(loader.load(source)),
    url: (source, variant) => pending.track(loader.url(source, variant)),
  };
}

/** `fetch` (e.g. an icon lookup) with every call counted in `pending`. */
export function tracked<A extends unknown[], R>(fetch: (...args: A) => Promise<R>, pending: PendingWork): (...args: A) => Promise<R> {
  return (...args) => pending.track(fetch(...args));
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** CSS `url(...)`s in a background-image value. */
function cssUrls(value: string): string[] {
  return Array.from(value.matchAll(/url\(["']?([^"')]+)["']?\)/g), (m) => m[1]);
}

/** Every image under `root` (img elements and CSS backgrounds) decoded; broken ones count as done. */
async function imagesDecoded(root: HTMLElement): Promise<void> {
  const decodes: Promise<unknown>[] = [];
  for (const img of root.querySelectorAll("img")) decodes.push(img.decode().catch(() => {}));
  for (const el of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
    for (const src of cssUrls(getComputedStyle(el).backgroundImage)) {
      const img = new Image();
      img.src = src;
      decodes.push(img.decode().catch(() => {}));
    }
  }
  await Promise.all(decodes);
}

/**
 * Resolves once the screen under `root` has settled: nothing in `pending`, no game font loading, images decoded, and
 * that still so a few frames later (a load that finishes renders again, which may start more loads). Rejects with
 * `signal`'s reason when aborted.
 */
export async function whenSettled(root: HTMLElement, pending: PendingWork, signal: AbortSignal): Promise<void> {
  const QUIET_CHECKS = 3;
  for (let quiet = 0; quiet < QUIET_CHECKS; ) {
    signal.throwIfAborted();
    await nextFrame();
    await nextFrame();
    await pending.idle();
    await document.fonts.ready;
    await imagesDecoded(root);
    quiet = pending.count === 0 && !fontsLoading() ? quiet + 1 : 0;
  }
  signal.throwIfAborted();
}
