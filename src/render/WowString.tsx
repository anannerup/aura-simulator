"use client";

import type { CSSProperties } from "react";
import { wowTextRuns, type WowInlineImage } from "@/core";
import { MissingTexture } from "./MappedTexture";
import { textureSourceOf } from "./media";
import { useTextureState } from "./textures";

/**
 * Text as a WoW FontString shows it: `|cAARRGGBB…|r` runs in their colour (the rest in the element's own colour),
 * `||` as `|`, `|n` as a line break, and `|T…|t` textures and `|A…|a` atlases as images inside the line
 * (`InlineImage`; see `wowTextRuns`).
 */
export function WowString({ text }: { text: unknown }) {
  return (
    <>
      {wowTextRuns(text).map((run, i) =>
        "image" in run ? (
          <InlineImage key={i} image={run.image} />
        ) : run.color ? (
          <span key={i} style={{ color: run.color }} data-wow-color={run.color}>
            {run.text}
          </span>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </>
  );
}

/**
 * An inline image of a font string: centred on the line, `height` units high (0: the font's height, 1em) and `width`
 * wide (0: as high), moved right and up by its offsets. A texture loads through the texture loader (by path or
 * FileDataID), cropped to its texel rectangle and multiplied by its colour; atlases have no atlas data here, so they
 * draw as a missing texture of their size, as does a file the game doesn't have.
 */
function InlineImage({ image }: { image: WowInlineImage }) {
  const source = image.kind === "texture" ? textureSourceOf(image.file) : null;
  const { texture, missing } = useTextureState(source, { crop: image.kind === "texture" ? image.texCoord : undefined, tint: image.color });
  const height = image.height > 0 ? image.height : "1em";
  const style: CSSProperties = {
    display: "inline-block",
    position: "relative",
    verticalAlign: "middle",
    height,
    width: image.width > 0 ? image.width : height,
    left: image.offsetX,
    top: -image.offsetY,
    backgroundImage: texture ? `url(${texture.url})` : undefined,
    backgroundSize: "100% 100%",
  };
  const why =
    image.kind === "atlas"
      ? `Atlas ${image.name} isn't drawn: the simulator has no atlas data`
      : source === null
        ? `Not a texture: ${image.file}`
        : missing;
  return (
    <span style={style} data-inline-image={image.kind === "atlas" ? `atlas:${image.name}` : image.file} title={why ?? undefined}>
      {why && <MissingTexture />}
    </span>
  );
}
