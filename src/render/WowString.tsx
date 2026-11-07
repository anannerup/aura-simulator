import { wowTextRuns } from "@/core";

/**
 * Text as a WoW FontString shows it: `|cAARRGGBB…|r` runs in their colour (the rest in the element's own colour),
 * `||` as `|`, `|n` as a line break; inline textures and atlases aren't drawn (see `wowTextRuns`).
 */
export function WowString({ text }: { text: unknown }) {
  return (
    <>
      {wowTextRuns(text).map((run, i) =>
        run.color ? (
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
