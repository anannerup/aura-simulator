"use client";

import type { CSSProperties } from "react";
import { getField, type LuaTable, type LuaValue } from "@/core";
import type { Box } from "../bar-geometry";
import type { AuraRenderState } from "../conditions";
import { borderEdge } from "../media";
import type { TextureSource } from "../textures/paths";
import { useTextureUrl } from "../textures/useTexture";
import { inflate, type SubRegionHost } from "./host";
import { color } from "./SubText";
import styles from "./subregions.module.css";

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

type Piece = "left" | "right" | "top" | "bottom" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
/** Backdrop edge files hold eight square pieces side by side, in this order. */
const PIECES: Piece[] = ["left", "right", "top", "bottom", "topLeft", "topRight", "bottomLeft", "bottomRight"];

/** The eight backdrop pieces of a `box` with edge size `e` (corners e×e, edges between them). Pure, for tests. */
export function backdropPieces(box: Box, e: number): Record<Piece, Box> {
  const s = Math.max(0, Math.min(e, box.width / 2, box.height / 2));
  const { width: w, height: h } = box;
  return {
    topLeft: { left: 0, top: 0, width: s, height: s },
    topRight: { left: w - s, top: 0, width: s, height: s },
    bottomLeft: { left: 0, top: h - s, width: s, height: s },
    bottomRight: { left: w - s, top: h - s, width: s, height: s },
    left: { left: 0, top: s, width: s, height: h - 2 * s },
    right: { left: w - s, top: s, width: s, height: h - 2 * s },
    top: { left: s, top: 0, width: w - 2 * s, height: s },
    bottom: { left: s, top: h - s, width: w - 2 * s, height: s },
  };
}

/**
 * A border sub-region (SubRegionTypes/Border.lua): a backdrop edge (`border_edge`, LSM border) of
 * `border_size` drawn on the anchor area grown by `border_offset`, tinted with `border_color`. Edges tile
 * along their length; the top and bottom pieces are stored turned, as in Blizzard's Backdrop.
 */
export function Border({ element, position, state, host }: { element: LuaTable; position: number; state: AuraRenderState; host: SubRegionHost }) {
  const p = state.properties;
  const visible = p[`sub.${position}.border_visible`] !== false;
  const rgba = color(p[`sub.${position}.border_color`] ?? getField(element, "border_color"));
  const edge = borderEdge(element);
  const size = num(getField(element, "border_size"), 2);
  const offset = num(getField(element, "border_offset"), 0);
  const area = host.regionType === "aurabar" ? getField(element, "anchor_area") ?? "bar" : undefined;
  const box = inflate(host.area(area, "border"), offset);
  if (!visible || edge === null) return null;
  const pieces = backdropPieces(box, size);
  return (
    <div
      className={styles.layer}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height, opacity: rgba[3] }}
      data-subregion="subborder"
      data-index={position}
    >
      {PIECES.map((piece, i) => (
        <EdgePiece key={piece} source={edge} index={i} piece={piece} box={pieces[piece]} size={size} tint={[rgba[0], rgba[1], rgba[2]]} />
      ))}
    </div>
  );
}

function EdgePiece({ source, index, piece, box, size, tint }: { source: TextureSource; index: number; piece: Piece; box: Box; size: number; tint: [number, number, number] }) {
  const tex = useTextureUrl(source, { crop: [index / 8, (index + 1) / 8, 0, 1], tint });
  if (box.width <= 0 || box.height <= 0) return null;
  const image: CSSProperties = tex ? { backgroundImage: `url(${tex.url})` } : {};
  if (piece === "left" || piece === "right") {
    return (
      <div
        className={styles.tile}
        data-piece={piece}
        style={{ ...box, ...image, backgroundSize: `${size}px ${size}px`, backgroundRepeat: "repeat-y" }}
      />
    );
  }
  if (piece === "top" || piece === "bottom") {
    // Turned 90° clockwise: the piece's length runs right-to-left along the edge.
    return (
      <div className={styles.tile} data-piece={piece} style={{ ...box, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: box.height,
            height: box.width,
            transform: "translate(-50%, -50%) rotate(90deg)",
            ...image,
            backgroundSize: `${size}px ${size}px`,
            backgroundRepeat: "repeat-y",
          }}
        />
      </div>
    );
  }
  return <div className={styles.tile} data-piece={piece} style={{ ...box, ...image }} />;
}
