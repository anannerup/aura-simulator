"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "./icons";
import styles from "./Section.module.css";

export interface SectionProps {
  title: ReactNode;
  /** An icon before the title. */
  icon?: ReactNode;
  /** Small things after the title: a count badge, a status. */
  meta?: ReactNode;
  /** Buttons on the right of the header; they don't toggle the section. */
  actions?: ReactNode;
  /** Starts open (default) or closed. */
  defaultOpen?: boolean;
  /** Without a toggle: always open. */
  collapsible?: boolean;
  children: ReactNode;
}

/** A titled, collapsible block of a side panel. */
export function Section({ title, icon, meta, actions, defaultOpen = true, collapsible = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const shown = !collapsible || open;
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.heading}>
          {collapsible ? (
            <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
              <ChevronDownIcon className={styles.chevron} size={14} />
              {icon && <span className={styles.icon}>{icon}</span>}
              <span className={styles.title}>{title}</span>
            </button>
          ) : (
            <span className={styles.toggle}>
              {icon && <span className={styles.icon}>{icon}</span>}
              <span className={styles.title}>{title}</span>
            </span>
          )}
        </h2>
        {meta && <span className={styles.meta}>{meta}</span>}
        {actions && <span className={styles.actions}>{actions}</span>}
      </div>
      <div id={bodyId} className={styles.body} hidden={!shown}>
        {children}
      </div>
    </section>
  );
}
