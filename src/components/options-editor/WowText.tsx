import { colorRuns } from "./wow-text";

/** Option text as the game shows it: `|c` colour escapes become coloured spans. */
export function WowText({ text }: { text: unknown }) {
  return (
    <>
      {colorRuns(text).map((run, i) =>
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
