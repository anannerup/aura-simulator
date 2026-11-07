"use client";

import { useId, useState, type HTMLAttributes, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/ui";
import styles from "./parts.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * A tool block in the aura list pane (Spell, Situation, Combat check), under the auras: a collapsible header bar in
 * the list's own header style, so it reads as part of the list and stays below the auras in weight.
 */
export function ListSection({ title, defaultOpen = true, children }: { title: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className={styles.listSection}>
      <h2 className={styles.listSectionHeading}>
        <button type="button" className={styles.listSectionToggle} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          <ChevronDownIcon className={styles.listSectionChevron} size={12} />
          {title}
        </button>
      </h2>
      <div id={bodyId} className={styles.listSectionBody} hidden={!open}>
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
 * The game screen pane beside the window: a dark surround with the game screen letterboxed in it, and a floating toolbar above it.
 * `children` must size itself to the canvas (the game screen does with `fill`).
 */
export function ScreenPane({
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
    <div className={styles.screenPane}>
      {toolbar && <div className={styles.toolbarDock}>{toolbar}</div>}
      {banner && <div className={styles.banner}>{banner}</div>}
      <div className={styles.canvas}>{children}</div>
      {overlay}
    </div>
  );
}

/** A centred status inside the screen pane (loading, errors). */
export function ScreenMessage({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <div className={styles.screenMessage} role={tone === "danger" ? "alert" : "status"}>
      {tone === "neutral" && <span className={styles.spinner} aria-hidden />}
      <div className={cx(styles.screenMessageText, tone === "danger" && styles.danger)}>{children}</div>
    </div>
  );
}

/** The floating toolbar over the screen pane. */
export function ScreenToolbar({ label, children }: { label: string; children: ReactNode }) {
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
