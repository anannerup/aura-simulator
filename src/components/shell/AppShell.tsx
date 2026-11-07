"use client";

import { useId, useState, type DragEvent, type ReactNode } from "react";
import { ChevronDownIcon, IconButton } from "@/components/ui";
import styles from "./AppShell.module.css";

export interface DrawerTab {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export interface AppShellProps {
  /** The window's accessible name ("Musca Auras options"). */
  windowLabel: string;
  /** The portrait in the window's top-left corner (the logo). */
  portrait?: ReactNode;
  /** The title bar's centre (the game, and the version picker). */
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
  /** The game screen beside the window (use `ScreenPane`). */
  screen: ReactNode;
  /** Optional tabs in a drawer under the game screen. Each tab's content stays mounted (hidden when not shown). */
  drawerTabs?: DrawerTab[];
  drawerMeta?: ReactNode;
  /** Files dropped anywhere on the window (import). */
  onDropFiles?: (files: File[]) => void;
}

/**
 * The app frame: the addon's options window (title bar, toolbar, aura list, option tabs, footer) docked on the left,
 * the game screen filling the rest, and an optional drawer under the screen. It fills the viewport and never scrolls
 * as a page; each pane scrolls on its own. Below 1100px the screen sits above the window.
 */
export function AppShell(props: AppShellProps) {
  const [drawerTab, setDrawerTab] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Minimised, the window is only its title bar and the game screen takes the whole browser window (as in game).
  const [minimized, setMinimized] = useState(false);
  const drawerId = useId();
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
    <div className={styles.shell} data-minimized={minimized} {...dropHandlers}>
      <section className={styles.window} aria-label={props.windowLabel} data-dragging={dragging}>
        {props.portrait && <div className={styles.portrait}>{props.portrait}</div>}
        <header className={styles.titleBar}>
          <div className={styles.title}>{props.title}</div>
          <div className={styles.titleActions}>
            {props.titleActions}
            <button
              type="button"
              className={styles.frameButton}
              aria-label={minimized ? "Restore window" : "Minimize window"}
              title={minimized ? "Restore window" : "Minimize window"}
              aria-expanded={!minimized}
              onClick={() => setMinimized(!minimized)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden focusable={false}>
                {minimized ? <path d="M3 11 11 3M5 3h6v6" /> : <path d="M11 3 3 11M3 5v6h6" />}
              </svg>
            </button>
          </div>
        </header>
        <div className={styles.windowBody} hidden={minimized}>
          <div className={styles.toolbar}>{props.toolbar}</div>
          <div className={styles.body}>
            <aside className={styles.list} aria-label="Auras">
              {props.list}
            </aside>
            <div className={styles.options}>{props.options}</div>
          </div>
          {props.footer && <footer className={styles.footer}>{props.footer}</footer>}
        </div>
      </section>

      <main className={styles.main}>
        <div className={styles.screen}>{props.screen}</div>
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
      {/* The whole page takes dropped files, the game screen included. */}
      {dragging && (
        <div className={styles.dropHint} aria-hidden>
          Drop a workspace file or a state code file to import it
        </div>
      )}
    </div>
  );
}
