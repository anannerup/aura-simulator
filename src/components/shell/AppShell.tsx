"use client";

import { createContext, useContext, useId, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { ChevronDownIcon, IconButton } from "@/components/ui";
import styles from "./AppShell.module.css";

export interface DrawerTab {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export interface AppShellProps {
  /** The portrait in the window's top-left corner (the logo). */
  portrait?: ReactNode;
  /** The title bar's centre ("Musca Auras 1.15.0"; the version picker). */
  title: ReactNode;
  /** The title bar's right side (the guide button). */
  titleActions?: ReactNode;
  /** The toolbar under the title (Undo, Redo, New Aura, Import). */
  toolbar: ReactNode;
  /** The window's left pane: the aura list. */
  list: ReactNode;
  /** The window's right pane: the option tabs, or the New Aura chooser. */
  options: ReactNode;
  /** The window's footer links. */
  footer?: ReactNode;
  /** The game screen beside the window (use `Stage`). */
  stage: ReactNode;
  /** Optional tabs in a drawer under the stage. Each tab's content stays mounted (hidden when not shown). */
  drawerTabs?: DrawerTab[];
  drawerMeta?: ReactNode;
  /** Files dropped anywhere on the window (import). */
  onDropFiles?: (files: File[]) => void;
}

export interface ShellState {
  /** The open drawer tab's id, or null when the drawer is closed. */
  drawerTab: string | null;
  setDrawerTab: (tab: string | null) => void;
}

const ShellContext = createContext<ShellState | null>(null);

/** The shell's panel state, for slot content that opens the drawer. */
export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <AppShell>");
  return ctx;
}

/**
 * The app frame: Musca Auras' options window (title bar, toolbar, aura list, option tabs, footer) docked on the left,
 * the game screen filling the rest, and an optional drawer under the screen. It fills the viewport and never scrolls
 * as a page; each pane scrolls on its own. Below 1100px the screen sits above the window.
 */
export function AppShell(props: AppShellProps) {
  const [drawerTab, setDrawerTab] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const drawerId = useId();
  const state = useMemo<ShellState>(() => ({ drawerTab, setDrawerTab }), [drawerTab]);
  const tabs = props.drawerTabs ?? [];
  const onDropFiles = props.onDropFiles;

  const dropHandlers = onDropFiles
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (e.currentTarget === e.target) setDragging(false);
        },
        onDrop: (e: DragEvent) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          onDropFiles(Array.from(e.dataTransfer.files));
        },
      }
    : {};

  return (
    <ShellContext.Provider value={state}>
      <div className={styles.shell}>
        <section className={styles.window} aria-label="Musca Auras options" data-dragging={dragging} {...dropHandlers}>
          {props.portrait && <div className={styles.portrait}>{props.portrait}</div>}
          <header className={styles.titleBar}>
            <div className={styles.title}>{props.title}</div>
            {props.titleActions && <div className={styles.titleActions}>{props.titleActions}</div>}
          </header>
          <div className={styles.toolbar}>{props.toolbar}</div>
          <div className={styles.body}>
            <aside className={styles.list} aria-label="Auras">
              {props.list}
            </aside>
            <div className={styles.options}>{props.options}</div>
          </div>
          {props.footer && <footer className={styles.footer}>{props.footer}</footer>}
          {dragging && (
            <div className={styles.dropHint} aria-hidden>
              Drop a workspace file or a state code file to import it
            </div>
          )}
        </section>

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
                <div className={styles.drawerMeta}>{props.drawerMeta}</div>
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
      </div>
    </ShellContext.Provider>
  );
}
