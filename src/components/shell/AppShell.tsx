"use client";

import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { ChevronUpIcon, IconButton, PanelLeftIcon, PanelRightIcon } from "@/components/ui";
import styles from "./AppShell.module.css";

export interface AppShellProps {
  /** The app's name and mark, at the top left. */
  brand: ReactNode;
  /** The rest of the top bar (use `TopBarGroup`, `TopBarSpacer`, `TopBarDivider`). */
  topBar: ReactNode;
  /** Left sidebar: the workspace's auras, the spell picker. */
  left: ReactNode;
  /** Accessible name of the left sidebar. */
  leftLabel?: string;
  /** The centre: the mock game screen (use `Stage`). */
  stage: ReactNode;
  /** Right sidebar: settings and option sections (use `InspectorSection`). */
  inspector: ReactNode;
  inspectorLabel?: string;
  /** Optional bottom drawer under the stage; its bar is always shown, its body when opened. */
  drawer?: ReactNode;
  /** The drawer bar's toggle text. */
  drawerTitle?: ReactNode;
  /** Extra things on the drawer bar (right side). */
  drawerMeta?: ReactNode;
}

export interface ShellState {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /** At narrow widths the sidebars are overlays; these open and close them. */
  leftOpen: boolean;
  setLeftOpen: (open: boolean) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellState | null>(null);

/** The shell's panel state, for slot content that opens the drawer or a sidebar. */
export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <AppShell>");
  return ctx;
}

/**
 * The app frame: a top bar, a left sidebar, the stage in the centre with an optional drawer under it, and an
 * inspector on the right. It fills the viewport and never scrolls as a page; each region scrolls on its own.
 * Below 1100px the inspector, and below 768px the left sidebar too, become overlay drawers opened from the top bar.
 */
export function AppShell(props: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const drawerBodyId = useId();
  const leftId = useId();
  const inspectorId = useId();

  const state = useMemo<ShellState>(
    () => ({ drawerOpen, setDrawerOpen, leftOpen, setLeftOpen, inspectorOpen, setInspectorOpen }),
    [drawerOpen, leftOpen, inspectorOpen],
  );

  return (
    <ShellContext.Provider value={state}>
      <div className={styles.shell} data-left-open={leftOpen} data-inspector-open={inspectorOpen}>
        <header className={styles.topBar}>
          <span className={styles.leftToggle}>
            <IconButton
              label={leftOpen ? "Hide aura list" : "Show aura list"}
              icon={<PanelLeftIcon />}
              pressed={leftOpen}
              aria-controls={leftId}
              onClick={() => {
                setLeftOpen(!leftOpen);
                setInspectorOpen(false);
              }}
            />
          </span>
          {props.brand}
          <div className={styles.topBarContent}>{props.topBar}</div>
          <span className={styles.inspectorToggle}>
            <IconButton
              label={inspectorOpen ? "Hide settings" : "Show settings"}
              icon={<PanelRightIcon />}
              pressed={inspectorOpen}
              aria-controls={inspectorId}
              tooltipSide="left"
              onClick={() => {
                setInspectorOpen(!inspectorOpen);
                setLeftOpen(false);
              }}
            />
          </span>
        </header>

        <aside id={leftId} className={styles.left} aria-label={props.leftLabel ?? "Auras"}>
          {props.left}
        </aside>

        <main className={styles.main}>
          <div className={styles.stage}>{props.stage}</div>
          {props.drawer && (
            <section className={styles.drawer} data-open={drawerOpen}>
              <div className={styles.drawerBar}>
                <button
                  type="button"
                  className={styles.drawerToggle}
                  aria-expanded={drawerOpen}
                  aria-controls={drawerBodyId}
                  onClick={() => setDrawerOpen(!drawerOpen)}
                >
                  <ChevronUpIcon className={styles.drawerChevron} size={14} />
                  {props.drawerTitle}
                </button>
                {props.drawerMeta && <div className={styles.drawerMeta}>{props.drawerMeta}</div>}
              </div>
              <div id={drawerBodyId} className={styles.drawerBody} hidden={!drawerOpen}>
                {props.drawer}
              </div>
            </section>
          )}
        </main>

        <aside id={inspectorId} className={styles.inspector} aria-label={props.inspectorLabel ?? "Inspector"}>
          {props.inspector}
        </aside>

        <div
          className={styles.scrim}
          aria-hidden
          onClick={() => {
            setLeftOpen(false);
            setInspectorOpen(false);
          }}
        />
      </div>
    </ShellContext.Provider>
  );
}
