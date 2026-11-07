"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trackedTextureLoader, whenSettled } from "@/client/render/settled";
import { findGame } from "@/games";
import { PendingWork } from "@/lib/pending";
import { fontFlagsStyle, useWowFont } from "@/render/fonts";
import { gameTextureLoader, TextureLoaderContext } from "@/render/textures";
import type { FontSampleOptions } from "@/workspace";
import styles from "../render/AuraRender.module.css";

/** Units of room around the text, for its outline and shadow (THICKOUTLINE reaches 2 units out). */
const ROOM = 3;

export interface FontSampleProps {
  gameId: string;
  addonRef: string;
  options: FontSampleOptions;
}

/**
 * One font sample as a picture, like the render page's: `text` in the game's font file, at `size` units and `scale`
 * pixels per unit, with its font flags and shadow drawn as the game screen draws a text's (`fontFlagsStyle`), on
 * `background` (transparent by default). Marks itself `data-ready` once the font has loaded (or failed: then the
 * game's default stands in, as in game) and its size is measured; `data-width`/`data-height` are its size in pixels.
 */
export function FontSample({ gameId, addonRef, options }: FontSampleProps) {
  const game = findGame(gameId);
  if (!game) throw new Error(`No game called "${gameId}"`);
  const [pending] = useState(() => new PendingWork());
  const textures = useMemo(() => trackedTextureLoader(gameTextureLoader(game, addonRef), pending), [game, addonRef, pending]);
  return (
    <TextureLoaderContext value={textures}>
      <Sample options={options} pending={pending} />
    </TextureLoaderContext>
  );
}

function Sample({ options, pending }: { options: FontSampleOptions; pending: PendingWork }) {
  const { font, text, size, outline, shadowX, shadowY, colour, scale, background } = options;
  const wow = useWowFont(font);
  const root = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      await whenSettled(root.current!, pending, abort.signal);
      const r = line.current!.getBoundingClientRect();
      setBox({ width: Math.ceil(r.width + 2 * ROOM * scale), height: Math.ceil(r.height + 2 * ROOM * scale) });
      await whenSettled(root.current!, pending, abort.signal);
      setReady(true);
    })().catch(() => {}); // aborted: the options changed
    return () => abort.abort();
  }, [pending, scale, wow.status]);

  return (
    <div
      ref={root}
      className={styles.picture}
      style={{ width: box?.width ?? 1, height: box?.height ?? 1, background: background ?? undefined }}
      data-testid="font-sample"
      data-font={wow.status}
      data-width={box?.width}
      data-height={box?.height}
      data-ready={ready ? "true" : undefined}
    >
      <div className={styles.layer} style={{ transform: `translate(${ROOM * scale}px, ${ROOM * scale}px) scale(${scale})` }}>
        <span
          ref={line}
          style={{
            display: "inline-block",
            whiteSpace: "pre",
            color: colour,
            fontFamily: wow.family,
            fontSize: size,
            lineHeight: 1, // as the game screen draws texts: the line box is the font size
            ...fontFlagsStyle(outline, { color: [0, 0, 0, 1], x: shadowX, y: shadowY }),
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
