import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Tooltip, type TooltipSide } from "./Tooltip";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** An icon before the label (decorative). */
  icon?: ReactNode;
  /** Stretch to the container's width. */
  block?: boolean;
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/** The app's button: primary (gold, one per area), secondary (outlined) or ghost (quiet). */
export function Button({ variant = "secondary", size = "md", icon, block, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], styles[size], block && styles.block, className)}
      {...rest}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** The accessible name, also shown as a tooltip. */
  label: string;
  icon: ReactNode;
  variant?: "ghost" | "secondary";
  size?: ButtonSize;
  /** For toggle buttons: sets aria-pressed and the pressed style. */
  pressed?: boolean;
  tooltipSide?: TooltipSide;
  /** Tooltip text when it should say more than the label (e.g. a keyboard shortcut). */
  tooltip?: ReactNode;
}

/** A square icon-only button; its label is its accessible name and its tooltip. */
export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  pressed,
  tooltipSide = "bottom",
  tooltip,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip content={tooltip ?? label} side={tooltipSide}>
      <button
        type={type}
        aria-label={label}
        aria-pressed={pressed}
        className={cx(styles.button, styles.iconOnly, styles[variant], styles[size], pressed && styles.pressed, className)}
        {...rest}
      >
        {icon}
      </button>
    </Tooltip>
  );
}
