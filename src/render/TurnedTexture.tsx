"use client";

import type { CSSProperties } from "react";
import type { Box, TextureTurn } from "./bar-geometry";
import { useTextureUrl } from "./textures";
import type { TextureSource } from "./textures/paths";

import { rgbaCss, type Rgba } from "./color";

/**
 * A WoW texture stretched over `box`, turned by 90° steps and/or mirrored (SetTexCoord with swapped corners),
 * coloured like SetVertexColor (RGB multiplies the pixels, alpha is the opacity). `blend` "ADD" draws it
 * additively. While the texture loads (or if it can't), `fallback` paints a flat colour instead.
 */
export function TurnedTexture({
  source,
  box,
  turn = { rotate: 0, mirror: false },
  color = [1, 1, 1, 1],
  desaturate = false,
  blend,
  fallback,
  className,
  testId,
  style,
}: {
  source: TextureSource | null;
  box: Box;
  turn?: TextureTurn;
  color?: Rgba;
  desaturate?: boolean;
  blend?: string;
  /** Flat colour while the texture is missing; omit to draw nothing. */
  fallback?: Rgba;
  className?: string;
  testId?: string;
  style?: CSSProperties;
}) {
  const tex = useTextureUrl(source, { tint: [color[0], color[1], color[2]], desaturate });
  const sideways = turn.rotate === 90 || turn.rotate === -90 || turn.rotate === 270;
  const w = sideways ? box.height : box.width;
  const h = sideways ? box.width : box.height;
  const transforms = ["translate(-50%, -50%)"];
  if (turn.mirror) transforms.push("scaleX(-1)");
  if (turn.rotate) transforms.push(`rotate(${turn.rotate}deg)`);
  const additive = blend === "ADD";
  return (
    <div
      className={className}
      data-testid={testId}
      data-texture={tex ? "loaded" : "pending"}
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        pointerEvents: "none",
        mixBlendMode: additive ? "plus-lighter" : undefined,
        ...style,
      }}
    >
      {tex ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: w,
            height: h,
            transform: transforms.join(" "),
            backgroundImage: `url(${tex.url})`,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
            opacity: color[3],
          }}
        />
      ) : fallback ? (
        <div style={{ position: "absolute", inset: 0, background: rgbaCss(fallback) }} />
      ) : null}
    </div>
  );
}

