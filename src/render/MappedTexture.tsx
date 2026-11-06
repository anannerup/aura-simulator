"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import type { Box } from "./bar-geometry";
import { clipPolygon, cssMatrix, IDENTITY, textureElementMatrix, type Affine, type Pt } from "./texture-geometry";
import type { TextureSource } from "./textures/paths";
import { useTextureUrl } from "./textures/useTexture";

export type Rgba = readonly [number, number, number, number];

/** WoW blend modes as CSS: ADD is additive, MOD multiplies; BLEND, ALPHAKEY and DISABLE draw normally. */
export function blendCss(blendMode: unknown): CSSProperties["mixBlendMode"] {
  if (blendMode === "ADD") return "plus-lighter";
  if (blendMode === "MOD") return "multiply";
  return undefined;
}

/**
 * SetDesaturated + SetVertexColor as an SVG colour matrix: luminance (the same weights as `textures/pixels.ts`)
 * when desaturated, then RGB multiplied by the vertex colour; alpha untouched. Computed per frame, so colour
 * animations don't need new pixel variants.
 */
export function ShadeFilter({ id, color, desaturate }: { id: string; color: Rgba; desaturate: boolean }) {
  const [r, g, b] = color;
  const row = (k: number) => (desaturate ? `${0.299 * k} ${0.587 * k} ${0.114 * k} 0 0` : null);
  const values = [
    row(r) ?? `${r} 0 0 0 0`,
    row(g) ?? `0 ${g} 0 0 0`,
    row(b) ?? `0 0 ${b} 0 0`,
    "0 0 0 1 0",
  ].join(" ");
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={values} />
      </filter>
    </svg>
  );
}

export const needsShade = (color: Rgba, desaturate: boolean) => desaturate || color[0] < 1 || color[1] < 1 || color[2] < 1;

/**
 * One WoW texture drawn the way the game's vertex/texcoord setup draws it: inside `box` (px, relative to the parent),
 * clipped to `polygon` (box coordinates; the quad's vertices) and showing texcoord `map(s)` at box coordinate `s`,
 * outside 0..1 transparent (CLAMPTOBLACKADDITIVE). `spin` (degrees, counter-clockwise) is Texture:SetRotation,
 * turning the whole quad about the box centre. Colour as SetVertexColor (alpha = opacity).
 */
export function MappedTexture({
  source,
  box,
  map = IDENTITY,
  polygon,
  color = [1, 1, 1, 1],
  desaturate = false,
  blendMode,
  spin = 0,
  testId,
  data,
  children,
}: {
  source: TextureSource | null;
  box: Box;
  map?: Affine;
  /** Omit for the whole box. An empty array draws nothing. */
  polygon?: readonly Pt[];
  color?: Rgba;
  desaturate?: boolean;
  blendMode?: unknown;
  spin?: number;
  testId?: string;
  data?: Record<string, string>;
  children?: ReactNode;
}) {
  const tex = useTextureUrl(source);
  const filterId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const shade = needsShade(color, desaturate);
  const matrix = textureElementMatrix(map, box.width, box.height);
  const hidden = polygon !== undefined && polygon.length < 3;
  const dataAttrs = Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [`data-${k}`, v]));
  return (
    <div
      data-testid={testId}
      data-texture={tex ? "loaded" : source === null ? "none" : "pending"}
      {...dataAttrs}
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        pointerEvents: "none",
        opacity: color[3],
        mixBlendMode: blendCss(blendMode),
        transform: spin ? `rotate(${-spin}deg)` : undefined,
        clipPath: polygon && !hidden ? clipPolygon(polygon) : undefined,
        visibility: hidden ? "hidden" : undefined,
        overflow: "hidden",
      }}
    >
      {shade && <ShadeFilter id={filterId} color={color} desaturate={desaturate} />}
      {tex && matrix && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: box.width,
            height: box.height,
            transformOrigin: "0 0",
            transform: cssMatrix(matrix),
            backgroundImage: `url(${tex.url})`,
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
            filter: shade ? `url(#${filterId})` : undefined,
          }}
        />
      )}
      {children}
    </div>
  );
}
