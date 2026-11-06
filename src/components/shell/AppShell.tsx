"use client";

import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { ChevronDownIcon, IconButton, PanelLeftIcon, PanelRightIcon } from "@/components/ui";
import styles from "./AppShell.module.css";

export interface DrawerTab {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

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
  /**
   * Optional bottom drawer under the stage, as tabs. The tab bar is always shown; clicking a tab opens the drawer on
   * it, clicking the open tab closes it. Every tab's content stays mounted (hidden when not shown), so editors keep
   * their unapplied edits.
   */
  drawerTabs?: DrawerTab[];
  /** Extra things on the drawer bar (right side). */
  drawerMeta?: ReactNode;
}

export interface ShellState {
  /** The open drawer tab's id, or null when the drawer is closed. */
  drawerTab: string | null;
  setDrawerTab: (tab: string | null) => void;
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
 * The app frame: a top bar, a left sidebar, the stage in the centre with an optional tabbed drawer under it, and an
 * inspector on the right. It fills the viewport and never scrolls as a page; each region scrolls on its own.
 * Below 1100px the inspector, and below 768px the left sidebar too, become overlay drawers opened from the top bar.
 */
export function AppShell(props: AppShellProps) {
  const [drawerTab, setDrawerTab] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const drawerId = useId();
  const leftId = useId();
  const inspectorId = useId();

  const state = useMemo<ShellState>(
    () => ({ drawerTab, setDrawerTab, leftOpen, setLeftOpen, inspectorOpen, setInspectorOpen }),
    [drawerTab, leftOpen, inspectorOpen],
  );
  const tabs = props.drawerTabs ?? [];

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
              label={inspectorOpen ? "Hide inspector" : "Show inspector"}
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
          {tabs.length > 0 && (
            <section className={styles.drawer} data-open={drawerTab !== null}>
              <div className={styles.drawerBar}>
                <div role="tablist" aria-label="Drawer" className={styles.drawerTabs}>
                  {tabs.map((tab) => {
                    const active = drawerTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        id={`${drawerId}-tab-${tab.id}`}
                        aria-selected={active}
                        aria-controls={`${drawerId}-panel-${tab.id}`}
                        className={styles.drawerTab}
                        onClick={() => setDrawerTab(active ? null : tab.id)}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
                {props.drawerMeta && <div className={styles.drawerMeta}>{props.drawerMeta}</div>}
                <IconButton
                  label={drawerTab === null ? "Open drawer" : "Close drawer"}
                  icon={<ChevronDownIcon className={styles.drawerChevron} />}
                  size="sm"
                  tooltipSide="left"
                  onClick={() => setDrawerTab(drawerTab === null ? tabs[0].id : null)}
                />
              </div>
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  id={`${drawerId}-panel-${tab.id}`}
                  role="tabpanel"
                  className={styles.drawerBody}
                  hidden={drawerTab !== tab.id}
                >
                  {tab.content}
                </div>
              ))}
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
