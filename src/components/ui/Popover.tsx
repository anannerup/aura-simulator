"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./Popover.module.css";

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Renders the trigger; spread `props` on the button so it is wired to the panel. */
  trigger: (props: { "aria-expanded": boolean; "aria-controls": string; onClick: () => void }) => ReactNode;
  /** Accessible name of the panel. */
  label: string;
  align?: "start" | "end";
  children: ReactNode;
}

/**
 * A panel that drops down from a trigger. It closes on Escape and on a click outside. The content stays mounted
 * while closed (just hidden), so its state and status lines survive.
 */
export function Popover({ open, onOpenChange, trigger, label, align = "start", children }: PopoverProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={root} className={styles.root}>
      {trigger({ "aria-expanded": open, "aria-controls": id, onClick: () => onOpenChange(!open) })}
      <div id={id} role="dialog" aria-label={label} className={`${styles.panel} ${styles[align]}`} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
