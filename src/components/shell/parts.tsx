"use client";

import { useId, useState, type HTMLAttributes, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/ui";
import styles from "./parts.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * A tool block in the aura list pane (Spell, Situation, Combat check), under the auras: a collapsible header bar in
 * the list's own header style, so it reads as part of the list and stays below the auras in weight.
 */
export function InspectorSection({ title, defaultOpen = true, children }: { title: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className={styles.inspector}>
      <h2 className={styles.inspectorHeading}>
        <button type="button" className={styles.inspectorToggle} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          <ChevronDownIcon className={styles.inspectorChevron} size={12} />
          {title}
        </button>
      </h2>
      <div id={bodyId} className={styles.inspectorBody} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/** A note in a sidebar section that has nothing to show yet. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

/**
 * The centre stage: a dark surround with the game screen letterboxed in it, and a floating toolbar above it.
 * `children` must size itself to the canvas (the mock screen does with `fill`).
 */
export function Stage({
  toolbar,
  banner,
  children,
  overlay,
}: {
  toolbar?: ReactNode;
  /** A message between the toolbar and the canvas (notices). */
  banner?: ReactNode;
  children: ReactNode;
  overlay?: ReactNode;
}) {
  return (
    <div className={styles.stage}>
      {toolbar && <div className={styles.toolbarDock}>{toolbar}</div>}
      {banner && <div className={styles.banner}>{banner}</div>}
      <div className={styles.canvas}>{children}</div>
      {overlay}
    </div>
  );
}

/** A centred status inside the stage (loading, errors). */
export function StageMessage({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <div className={styles.stageMessage} role={tone === "danger" ? "alert" : "status"}>
      {tone === "neutral" && <span className={styles.spinner} aria-hidden />}
      <div className={cx(styles.stageMessageText, tone === "danger" && styles.danger)}>{children}</div>
    </div>
  );
}

/** The floating toolbar over the stage. */
export function StageToolbar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="toolbar" aria-label={label} className={styles.toolbar}>
      {children}
    </div>
  );
}

export const ToolbarSeparator = () => <span className={styles.toolbarSeparator} aria-hidden />;

/** Read-only text in a toolbar (e.g. the resolution). */
export function ToolbarText({ children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={styles.toolbarText} {...rest}>
      {children}
    </span>
  );
}
