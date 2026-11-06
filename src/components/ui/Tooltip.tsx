import type { ReactNode } from "react";
import styles from "./Tooltip.module.css";

export type TooltipSide = "top" | "bottom" | "left" | "right";

/**
 * A hover/focus hint for its child. Purely visual (aria-hidden): give the child its own accessible name
 * (IconButton does this with `label`), so screen readers don't hear the text twice.
 */
export function Tooltip({ content, side = "top", children }: { content: ReactNode; side?: TooltipSide; children: ReactNode }) {
  return (
    <span className={styles.host}>
      {children}
      <span className={`${styles.tip} ${styles[side]}`} aria-hidden>
        {content}
      </span>
    </span>
  );
}
