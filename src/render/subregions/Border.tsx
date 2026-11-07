"use client";

import type { CSSProperties } from "react";
import { getField, num, type AuraRenderState, type LuaTable } from "@/core";
import type { Box } from "../screen/geometry";
import { borderEdge } from "../media";
import type { TextureSource } from "../textures/paths";
import { useTextureUrl } from "../textures";
import { frameGrid, pixelBox, PixelSpace, usePixelGrid } from "../pixel-grid";
import { inflate, type SubRegionHost } from "./host";
import { color } from "../color";
import styles from "./subregions.module.css";


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
 * along their length; the top and bottom pieces are stored turned, as in Blizzard's Backdrop. Each piece is snapped
 * to the pixel grid like the game's textures, so a 1-unit border shows all four sides at any scale.
 */
export function Border({ element, position, state, host }: { element: LuaTable; position: number; state: AuraRenderState; host: SubRegionHost }) {
  const p = state.properties;
  const visible = p[`sub.${position}.border_visible`] !== false;
  const rgba = color(p[`sub.${position}.border_color`]);
  const edge = borderEdge(element);
  const size = num(getField(element, "border_size"), 2);
  const offset = num(getField(element, "border_offset"), 0);
  const box = inflate(host.area(getField(element, "anchor_area"), "border"), offset);
  const frame = usePixelGrid();
  if (!visible || edge === null) return null;
  const pieces = backdropPieces(box, size);
  const tint: [number, number, number] = [rgba[0], rgba[1], rgba[2]];
  const grid = frame && frameGrid(frame, box.left, box.top);
  // On the pixel grid when the surface gives one (each piece snapped like the game's textures), else in units.
  const drawn = PIECES.map((piece, i) => (
    <EdgePiece
      key={piece}
      source={edge}
      index={i}
      piece={piece}
      box={grid ? pixelBox(pieces[piece], grid) : pieces[piece]}
      size={grid ? size * grid.perUnit : size}
      tint={tint}
    />
  ));
  return (
    <div
      className={styles.layer}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height, opacity: rgba[3] }}
      data-subregion="subborder"
      data-index={position}
    >
      {grid ? <PixelSpace grid={grid}>{drawn}</PixelSpace> : drawn}
    </div>
  );
}

/**
 * One backdrop piece (`box` and `size` in the CSS pixels it is drawn in). Edges stretch across their thickness and
 * tile along their length, one piece per `size`;
 * the top and bottom edges draw their piece turned a quarter clockwise, so its length runs right-to-left along the edge.
 */
function EdgePiece({ source, index, piece, box, size, tint }: { source: TextureSource; index: number; piece: Piece; box: Box; size: number; tint: [number, number, number] }) {
  const across = piece === "top" || piece === "bottom";
  const tex = useTextureUrl(source, { crop: [index / 8, (index + 1) / 8, 0, 1], turn: across || undefined, tint });
  if (box.width <= 0 || box.height <= 0) return null;
  const image: CSSProperties = tex ? { backgroundImage: `url(${tex.url})` } : {};
  const tiling: CSSProperties =
    piece === "left" || piece === "right"
      ? { backgroundSize: `${box.width}px ${size}px`, backgroundRepeat: "repeat-y" }
      : across
        ? { backgroundSize: `${size}px ${box.height}px`, backgroundRepeat: "repeat-x" }
        : {};
  return <div className={styles.tile} data-piece={piece} style={{ ...box, ...image, ...tiling }} />;
}
