/**
 * The compare endpoint's work: the player's screenshot of an aura against the aura's picture from the render page,
 * aligned (scale and offset found, or the scale given), measured per region, with a comparison picture.
 */
import type { ServerGame } from "@/server/game";
import { captureRender, RenderPageError, type RenderedRegion } from "@/server/screenshot";
import { renderScene } from "@/server/workspaces";
import { buildRenderUrl, DEFAULT_RENDER_OPTIONS, MAX_RENDER_SCALE, type RenderOptions } from "@/workspace";
import { align, backgroundOf, CompareError, comparisonImage, measure, type Alignment, type CompareMetrics, type PictureRegion } from "./compare";
import { decodeImage, encodePng, resizeImage, type RgbaImage } from "./image";

export { CompareError } from "./compare";
export { ImageError } from "./image";

export interface CompareRequest {
  /** Which aura, in which situation, with which addon version (the render options; scale, padding and background are the compare's own). */
  render: Pick<RenderOptions, "aura" | "situation" | "ref">;
  /** Game pixels per UI unit when known (the player's UI scale): only the offset is searched. */
  scale?: number;
  /** The game window's height in pixels: the answer then says the UI scale (`scale × 768 / screenHeight`). */
  screenHeight?: number;
}

export interface CompareResult extends CompareMetrics {
  auraId: string;
  revision: number;
  /** Game pixels per UI unit of the best alignment, and whether it was searched (or given). */
  scale: number;
  scaleSearched: boolean;
  /** The UI scale that scale means, when the window height was given. */
  uiScale?: number;
  /** The other scales the aura was drawn at and placed, best first (a close score: the scale is ambiguous). */
  otherScales: { scale: number; score: number }[];
  /** Where the picture's top left lies on the screenshot (pixels). */
  offset: { x: number; y: number };
  background: { colour: string; uniform: number };
  screenshot: { width: number; height: number };
  picture: { width: number; height: number };
  /** The comparison picture (PNG): screenshot | picture | difference, enlarged `zoom` times. */
  comparison: { png: Buffer; zoom: number };
  /** The aura's picture at `scale` (PNG, transparent). */
  picturePng: Buffer;
}

/** The scale the search draws the aura at, to resize down from (and smaller ones when that is too large a picture). */
const SEARCH_SCALES = [4, 2, 1];

const hex = (c: number[]) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

async function picture(server: ServerGame, origin: string, workspaceId: string, render: CompareRequest["render"], scale: number) {
  const url = buildRenderUrl(origin, server.game.id, workspaceId, { ...render, scale });
  const { png, regions } = await captureRender(url);
  return { png, image: await decodeImage(png), regions };
}

/** The regions drawn inside the picture (a group's other auras can lie outside its crop). */
function inside(regions: RenderedRegion[], img: RgbaImage): PictureRegion[] {
  return regions.filter((r) => r.box.left < img.width && r.box.top < img.height && r.box.left + r.box.width > 0 && r.box.top + r.box.height > 0);
}

/**
 * Compares `screenshot` (an image file) with the workspace's aura. Throws `PushError` (nothing to draw), `ImageError`
 * (not a picture), `CompareError` (nothing to compare), `RenderPageError` and `ScreenshotUnavailable` (no browser).
 */
export async function compareScreenshot(server: ServerGame, origin: string, workspaceId: string, request: CompareRequest, screenshot: Uint8Array): Promise<CompareResult> {
  const scene = await renderScene(server, workspaceId, { ...DEFAULT_RENDER_OPTIONS, ...request.render });
  const render = { ...request.render, aura: scene.auraId };
  const shot = await decodeImage(screenshot);
  const background = backgroundOf(shot);

  let searched: Awaited<ReturnType<typeof picture>> | undefined;
  let searchScale = request.scale ?? SEARCH_SCALES[0];
  for (const s of request.scale !== undefined ? [request.scale] : SEARCH_SCALES) {
    try {
      searched = await picture(server, origin, workspaceId, render, s);
      searchScale = s;
      break;
    } catch (e) {
      if (!(e instanceof RenderPageError) || s === SEARCH_SCALES.at(-1)) throw e;
    }
  }
  const found = await align({ shot, background, picture: searched!.image, pictureScale: searchScale, scale: request.scale, resize: resizeImage });
  if (found.best.scale > MAX_RENDER_SCALE) throw new CompareError(`The screenshot shows the aura at ${round3(found.best.scale)} pixels per UI unit, over ${MAX_RENDER_SCALE}: is it enlarged?`);

  // The aura drawn at the best scales found (the game rounds borders and edges to whole pixels at each scale, which a
  // resized picture only approximates), each placed again; the best of those, and half a percent either side of it.
  let exact = searched!;
  let at: Alignment = found.best;
  const tried: { scale: number; score: number }[] = [];
  if (request.scale === undefined) {
    const drawnAt = async (scale: number) => {
      scale = round3(scale);
      if (tried.some((t) => t.scale === scale) || scale <= 0 || scale > MAX_RENDER_SCALE) return;
      const p = await picture(server, origin, workspaceId, render, scale);
      const a = (await align({ shot, background, picture: p.image, pictureScale: scale, scale, resize: resizeImage })).best;
      tried.push({ scale, score: a.score });
      if (tried.length === 1 || a.score < at.score) [exact, at] = [p, a];
    };
    const distinct = found.scales.filter((s, i, all) => all.slice(0, i).every((o) => Math.abs(o.scale - s.scale) / s.scale > 0.005));
    for (const s of distinct.slice(0, 3)) await drawnAt(s.scale);
    const best = at.scale;
    for (const f of [0.995, 1.005]) await drawnAt(best * f);
  }
  const regions = inside(exact.regions, exact.image);
  const metrics = measure(shot, background, exact.image, regions, at);
  const side = Math.max(shot.width, shot.height);
  const zoom = Math.max(1, Math.min(8, Math.floor(384 / side)));
  const comparison = await encodePng(comparisonImage(shot, background, exact.image, regions, at, zoom));
  return {
    auraId: scene.auraId,
    revision: scene.revision,
    scale: round3(at.scale),
    scaleSearched: request.scale === undefined,
    ...(request.screenHeight && { uiScale: round3((at.scale * 768) / request.screenHeight) }),
    otherScales: tried
      .filter((t) => t.scale !== round3(at.scale))
      .sort((a, b) => a.score - b.score)
      .map((t) => ({ scale: t.scale, score: Math.round(t.score * 100) / 100 })),
    offset: { x: at.dx, y: at.dy },
    background: { colour: hex(background.colour), uniform: Math.round(background.uniform * 100) / 100 },
    screenshot: { width: shot.width, height: shot.height },
    picture: { width: exact.image.width, height: exact.image.height },
    ...metrics,
    comparison: { png: comparison, zoom },
    picturePng: exact.png,
  };
}
