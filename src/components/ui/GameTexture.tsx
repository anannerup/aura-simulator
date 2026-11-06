"use client";

import type { CSSProperties } from "react";
import { useTextureUrl } from "@/render/textures/useTexture";
import styles from "./GameTexture.module.css";

/** Musca Auras' own UI media (logo, toolbar and footer icons), fetched at runtime and never committed. */
export const ADDON_MEDIA = (name: string) => `Interface\\AddOns\\WeakAuras\\Media\\Textures\\${name}`;

export interface GameTextureProps {
  /** A game texture path (`Interface\\AddOns\\...`) or a Blizzard FileDataID. */
  source: string | number;
  size: number;
  /** Height when not square. */
  height?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * A game texture as a decorative image. Keeps its box while loading (or if it can't be fetched), so the layout
 * doesn't jump.
 */
export function GameTexture({ source, size, height = size, className, style }: GameTextureProps) {
  const texture = useTextureUrl(source);
  const box = { width: size, height, ...style };
  if (!texture) return <span className={[styles.placeholder, className].filter(Boolean).join(" ")} style={box} aria-hidden />;
  return (
    // A runtime blob URL from the texture loader; next/image can't optimise it.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={texture.url} alt="" aria-hidden className={[styles.texture, className].filter(Boolean).join(" ")} style={box} draggable={false} />
  );
}
