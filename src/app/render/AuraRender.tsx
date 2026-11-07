"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { readSituation } from "@/core";
import { drawnBounds, layoutBounds } from "@/client/render/crop";
import { tracked, trackedTextureLoader, whenSettled } from "@/client/render/settled";
import { findGame } from "@/games";
import { PendingWork } from "@/lib/pending";
import { PixelGridContext, surfaceGrid } from "@/render/pixel-grid";
import { evaluateScreen, GameScreenAuras } from "@/render/screen/GameScreenAuras";
import { uiParent, type Box } from "@/render/screen/geometry";
import { createIconStore, gameTextureLoader, IconStoreContext, iconsFromApi, TextureLoaderContext } from "@/render/textures";
import { findNode, MAX_RENDER_PIXELS, traverse, type RenderOptions } from "@/workspace";
import type { RenderScene } from "@/api/render";
import styles from "./AuraRender.module.css";

/**
 * The game screen a still picture is drawn on. Only positions relative to the aura matter once it is cropped, so any
 * screen does; this one is 1920 × 1080 with UI scale off (UIParent 768 units high).
 */
const SCREEN = uiParent({ width: 1920, height: 1080, useUiScale: false, uiScale: 1 });
/** The still moment: one second after each aura appeared, past every start animation's usual length and glows' fade-in. */
const STILL_SECONDS = 1;

export interface AuraRenderProps {
  gameId: string;
  scene: RenderScene;
  options: Pick<RenderOptions, "scale" | "padding" | "background">;
}

/**
 * The render page's picture: one top-level aura drawn as the game draws it, still, cropped to the bounds of
 * `scene.auraId` plus padding, at `scale` pixels per UI unit, with no selection, stand-ins or window around it. Marks
 * itself `data-ready` once every texture, icon and font has arrived and the crop is measured; `data-width` and
 * `data-height` are its size in pixels.
 */
export function AuraRender({ gameId, scene, options }: AuraRenderProps) {
  const game = findGame(gameId);
  if (!game) throw new Error(`No game called "${gameId}"`);
  const { scale, padding, background } = options;
  const [pending] = useState(() => new PendingWork());
  const textures = useMemo(
    () => trackedTextureLoader(gameTextureLoader(game, scene.ref), pending),
    [game, scene.ref, pending],
  );
  const iconStore = useMemo(() => createIconStore(tracked(iconsFromApi(`/api/${game.id}/icons`), pending)), [game, pending]);
  const situation = useMemo(() => readSituation(scene.situation, game.id), [scene.situation, game.id]);
  const problems = useMemo(() => new Map(scene.problems), [scene.problems]);
  const items = useMemo(() => [scene.node], [scene.node]);
  const ids = useMemo(() => {
    const target = findNode(items, scene.auraId)?.node;
    return new Set(target ? Array.from(traverse([target]), (n) => String(n.aura.id)) : []);
  }, [items, scene.auraId]);
  const planned = useMemo(
    () => layoutBounds(evaluateScreen(items, SCREEN, situation, game.id, undefined, problems).layout, ids),
    [items, situation, game.id, problems, ids],
  );

  const root = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Box | null>(null);
  const [ready, setReady] = useState(false);
  const crop = measured ?? planned ?? { left: 0, top: 0, width: 0, height: 0 };

  // Settle (files in), measure what was drawn and crop to it, settle again at the new crop, then report ready.
  useEffect(() => {
    const abort = new AbortController();
    const settle = () => whenSettled(root.current!, pending, abort.signal);
    void (async () => {
      await settle();
      const drawn = drawnBounds(screen.current!, ids, scale);
      if (drawn) setMeasured(drawn);
      await settle();
      setReady(true);
    })().catch(() => {}); // aborted: the scene changed, a new run started
    return () => abort.abort();
  }, [pending, ids, scale]);

  const width = Math.max(1, Math.round((crop.width + 2 * padding) * scale));
  const height = Math.max(1, Math.round((crop.height + 2 * padding) * scale));
  if (width > MAX_RENDER_PIXELS || height > MAX_RENDER_PIXELS) {
    return <RenderProblem message={`The picture would be ${width} × ${height} pixels, over ${MAX_RENDER_PIXELS}: use a smaller scale or padding`} />;
  }
  // UIParent's corner, on a whole pixel of the picture: the browser then draws the layer on the picture's pixels, and
  // what the game snaps to the pixel grid (`PixelGridContext`) lands on them.
  const grid = surfaceGrid(scale, Math.round((padding - crop.left) * scale), Math.round((padding - crop.top) * scale));
  const layer = {
    transform: `translate(${grid.x}px, ${grid.y}px) scale(${scale})`,
    "--css-per-unit": scale,
  } as CSSProperties;

  return (
    <IconStoreContext value={iconStore}>
      <TextureLoaderContext value={textures}>
        <div
          ref={root}
          className={styles.picture}
          style={{ width, height, background: background ?? undefined }}
          data-testid="aura-render"
          data-render-aura={scene.auraId}
          data-revision={scene.revision}
          data-width={width}
          data-height={height}
          data-ready={ready ? "true" : undefined}
        >
          <div ref={screen} className={styles.layer} style={layer}>
            <PixelGridContext value={grid}>
              <GameScreenAuras game={game.id} items={items} situation={situation} screen={SCREEN} problems={problems} standIns={false} still={STILL_SECONDS} />
            </PixelGridContext>
          </div>
        </div>
      </TextureLoaderContext>
    </IconStoreContext>
  );
}

/** What the render page shows instead of a picture; the screenshot endpoint answers with `data-render-error`. */
export function RenderProblem({ message }: { message: string }) {
  return (
    <p className={styles.problem} data-render-error={message}>
      {message}
    </p>
  );
}
