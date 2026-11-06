import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "accent" | "info" | "warn" | "danger" | "success";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
  /** Monospace text (ids, versions). */
  mono?: boolean;
}

/** A small label: spell flags, warnings, versions, counts. */
export function Badge({ tone = "neutral", icon, mono, className, children, ...rest }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[tone], mono && styles.mono, className].filter(Boolean).join(" ")} {...rest}>
      {icon}
      {children}
    </span>
  );
}

export interface CalloutProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Exclude<BadgeTone, "neutral" | "accent">;
  icon?: ReactNode;
}

/** A tinted message box for notices and errors inside a panel. */
export function Callout({ tone = "info", icon, className, children, ...rest }: CalloutProps) {
  return (
    <div className={[styles.callout, styles[tone], className].filter(Boolean).join(" ")} {...rest}>
      {icon && <span className={styles.calloutIcon}>{icon}</span>}
      <div className={styles.calloutBody}>{children}</div>
    </div>
  );
}
