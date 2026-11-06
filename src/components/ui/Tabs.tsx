"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

export interface TabSpec {
  id: string;
  label: ReactNode;
  content: ReactNode;
  /** Spans half the row (the second row's "Custom Options" and "Information" in game). */
  wide?: boolean;
}

export interface TabsProps {
  /** Accessible name of the tab list. */
  label: string;
  tabs: TabSpec[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * The options window's tab buttons over a scrolling panel. Every panel stays mounted (hidden when not shown), so
 * editors keep their state. Arrow keys move between tabs.
 */
export function Tabs({ label, tabs, value, onChange, className }: TabsProps) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.id === value),
  );

  function onKeyDown(e: KeyboardEvent) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div className={[styles.tabs, className].filter(Boolean).join(" ")}>
      <div role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${tab.id}`}
            aria-selected={tab.id === value}
            aria-controls={`${id}-panel-${tab.id}`}
            tabIndex={tab.id === value ? 0 : -1}
            className={[styles.tab, tab.wide && styles.wide].filter(Boolean).join(" ")}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={styles.panels}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`${id}-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${tab.id}`}
            className={styles.panel}
            hidden={tab.id !== value}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
