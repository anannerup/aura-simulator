import type { HTMLAttributes, ReactNode } from "react";
import { Section, type SectionProps } from "@/components/ui";
import styles from "./parts.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/** The app's mark and name for the top bar (the page's heading). The name hides on phones. */
export function Brand({ name }: { name: string }) {
  return (
    <h1 className={styles.brand} aria-label={name}>
      <LogoMark />
      <span className={styles.brandName}>{name}</span>
    </h1>
  );
}

/** A gold rune-like diamond: an aura's glow around an icon. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg className={styles.mark} width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable={false}>
      <defs>
        <linearGradient id="aura-mark-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0a8" />
          <stop offset="0.5" stopColor="#ffd100" />
          <stop offset="1" stopColor="#b98a00" />
        </linearGradient>
      </defs>
      <path d="M16 1.5 30.5 16 16 30.5 1.5 16z" fill="none" stroke="url(#aura-mark-gold)" strokeWidth="2" />
      <rect x="10" y="10" width="12" height="12" rx="1.5" fill="url(#aura-mark-gold)" />
      <path d="M16 12.5v7M12.5 16h7" stroke="#2a1f00" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A cluster of top-bar items. `hideBelow` hides it on narrower screens. */
export function TopBarGroup({
  hideBelow,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { hideBelow?: "tablet" | "desktop" }) {
  return <div className={cx(styles.group, hideBelow === "tablet" && styles.hideBelowTablet, hideBelow === "desktop" && styles.hideBelowDesktop, className)} {...rest} />;
}

export const TopBarSpacer = () => <span className={styles.spacer} />;
export const TopBarDivider = () => <span className={styles.divider} aria-hidden />;

/** A labelled read-only chip for the top bar (workspace id, counts). */
export function TopBarChip({ label, children, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { label: ReactNode }) {
  return (
    <span className={cx(styles.chip, className)} {...rest}>
      <span className={styles.chipLabel}>{label}</span>
      {children}
    </span>
  );
}

/** A section of the right inspector (or the left sidebar): a collapsible titled block. */
export function InspectorSection(props: SectionProps) {
  return <Section {...props} />;
}

/** A note in a sidebar section that has nothing to show yet. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

/**
 * The centre stage: a dark surround with the game screen letterboxed in it, and a floating toolbar above it.
 * `children` must size itself to the canvas (the mock screen does with `fill`).
 */
export function Stage({ toolbar, children, overlay }: { toolbar?: ReactNode; children: ReactNode; overlay?: ReactNode }) {
  return (
    <div className={styles.stage}>
      {toolbar && <div className={styles.toolbarDock}>{toolbar}</div>}
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
