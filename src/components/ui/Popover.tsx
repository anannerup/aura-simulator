"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

const GAP = 8;
const MARGIN = 12;

/**
 * A panel that drops down from a trigger. It is positioned against the viewport (so scrolling panes don't clip it),
 * closes on Escape and on a click outside, and stays mounted while closed (just hidden), so its state survives.
 */
export function Popover({ open, onOpenChange, trigger, label, align = "start", children }: PopoverProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const anchor = root.current?.getBoundingClientRect();
      if (!anchor) return;
      const vw = window.innerWidth;
      const width = Math.min(420, vw - 2 * MARGIN);
      const left =
        align === "end" ? Math.max(MARGIN, Math.min(anchor.right, vw - MARGIN) - width) : Math.max(MARGIN, Math.min(anchor.left, vw - MARGIN - width));
      const top = anchor.bottom + GAP;
      setPlace({ top, left, width, maxHeight: window.innerHeight - top - MARGIN });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, align]);

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
      <div ref={panel} id={id} role="dialog" aria-label={label} className={styles.panel} style={place} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
