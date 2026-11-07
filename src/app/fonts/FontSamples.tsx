"use client";

import { useEffect, useMemo, useState } from "react";
import type { MediaEntry } from "@/api/media";
import { findGame } from "@/games";
import type { AddonGameId } from "@/core";
import { ensureFont, fontFamily, fontFlagsStyle } from "@/render/fonts";
import { FONTS } from "@/render/media";
import { gameTextureLoader } from "@/render/textures";
import styles from "./FontSamples.module.css";

interface FontSamplesProps {
  gameId: AddonGameId;
  addonRef: string;
  fonts: MediaEntry[];
  defaultFont: string | null;
  text: string;
  size: number;
  /** Font flags as an aura stores them (`OUTLINE`, `THICKOUTLINE`, `None`). */
  outline: string;
}

/**
 * Every font of the game's LibSharedMedia list drawing the same sample text, in the game's own font files (loaded like
 * the game screen loads them), white on a dark game-like background, for telling a screenshot's font apart.
 */
export function FontSamples({ gameId, addonRef, fonts, defaultFont, text, size, outline }: FontSamplesProps) {
  const game = findGame(gameId)!;
  const loader = useMemo(() => gameTextureLoader(game, addonRef), [game, addonRef]);
  const [, setLoaded] = useState(0);
  useEffect(() => {
    for (const f of fonts) if (f.name in FONTS) ensureFont(f.name, loader);
    // Re-render as fonts arrive (document.fonts tells when one has loaded).
    const onLoad = () => setLoaded((n) => n + 1);
    document.fonts.addEventListener("loadingdone", onLoad);
    return () => document.fonts.removeEventListener("loadingdone", onLoad);
  }, [fonts, loader]);
  const flags = fontFlagsStyle(outline, { color: [0, 0, 0, 1], x: 0, y: 0 });

  return (
    <ul className={styles.list}>
      {fonts.map((f) => {
        const drawn = f.name in FONTS;
        return (
          <li key={f.name} className={styles.row} data-font={f.name}>
            <div className={styles.label}>
              <strong>{f.name}</strong>
              {f.name === defaultFont && <span className={styles.tag}>default</span>}
              <span className={styles.tag}>{f.from === "addon" ? `${game.addon.name}'s` : "game"}</span>
              <code className={styles.file}>{String(f.file)}</code>
              {!drawn && <span className={styles.note}>not drawn by the simulator (shown in the default font)</span>}
            </div>
            <div className={styles.sample} style={{ fontFamily: fontFamily(f.name), fontSize: size, ...flags }}>
              {text}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
