"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sampleIconAura, type AuraDocument } from "@/core";
import { OptionsEditor } from "@/components/options-editor/OptionsEditor";
import { RawEditor } from "@/components/raw-editor/RawEditor";
import { AppShell, EmptyNote, InspectorSection, Stage, StageMessage } from "@/components/shell";
import { SpellPicker } from "@/components/spell-picker/SpellPicker";
import { WorkspaceTree } from "@/components/workspace-tree/WorkspaceTree";
import { ADDON_MEDIA, Button, GameTexture, Popover, ToastProvider } from "@/components/ui";
import { ensureFont } from "@/render/fonts";
import { WorkspaceStage } from "@/render/group/WorkspaceStage";
import { DEFAULT_SITUATION } from "@/render/situation";
import { DEFAULT_WORKSPACE_ID } from "@/workspace";
import { AddonVersionMenu } from "./_addon/AddonVersionPicker";
import { useAddonCore } from "./_addon/useAddonCore";
import { ExportPanel, ImportPanel, useImporter } from "./import-export/ImportExport";
import { NewAuraChooser } from "./NewAuraChooser";
import { GameScreenStage, useGameScreen } from "./screen/GameScreen";
import { SituationControls } from "./SituationControls";
import { ValidationPanel } from "./validation/ValidationPanel";
import type { LoadResult } from "./workspace/session";
import { useUndo } from "./workspace/useUndo";
import { useWorkspace } from "./workspace/useWorkspace";
import styles from "./Workbench.module.css";

/**
 * The composition root: loads the chosen addon version, follows the workspace, and wires each feature into the app
 * shell (`src/components/shell`): the window (title, toolbar, aura list, tabs, footer) beside the game screen.
 */
export function Workbench() {
  const addon = useAddonCore();
  const { core } = addon;
  const [situation, setSituation] = useState(DEFAULT_SITUATION);
  const screen = useGameScreen();
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // The window's title font (Friz Quadrata), from the game files at runtime.
  useEffect(() => ensureFont("Friz Quadrata TT"), []);

  // The sample aura is only the fallback when nothing else (browser storage, server) has an aura.
  const fallbackCode = useMemo(() => {
    if (!core) return null;
    const aura: AuraDocument = sampleIconAura(core.internalVersion);
    return core.encode({ aura, children: [] });
  }, [core]);
  const workspace = useWorkspace(core, fallbackCode);
  const importer = useImporter(workspace);

  // Edits (tabs, spell picker, raw table) replace the selected item's document; storage and server follow.
  const updateSelected = workspace.updateSelected;
  const changeAura = useCallback((aura: AuraDocument): LoadResult => updateSelected(aura), [updateSelected]);
  // Undo/redo over whole-workspace snapshots (tree + selection), whatever made the change: editors, tree, paste, push.
  const { items, selectedId, setItems } = workspace;
  const snapshot = useMemo(() => (items.length ? JSON.stringify({ items, selectedId }) : null), [items, selectedId]);
  const restore = useCallback(
    (text: string): LoadResult => {
      const s = JSON.parse(text) as { items: typeof items; selectedId: string | null };
      return setItems(s.items, s.selectedId);
    },
    [setItems],
  );
  const history = useUndo(snapshot, restore);
  // Auras hidden in the preview only (as if their trigger were inactive), e.g. to see a dynamic group close up.
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const ready = !!core && workspace.ready;
  const aura = ready ? workspace.aura : null;
  const code = ready ? workspace.code : null;
  const selectedIsGroup = aura?.regionType === "group" || aura?.regionType === "dynamicgroup";
  const select = (id: string) => {
    setCreating(false);
    workspace.select(id);
  };

  return (
    <ToastProvider>
      <AppShell
        portrait={<GameTexture source={ADDON_MEDIA("logo_musca_round")} size={62} />}
        title={<AddonVersionMenu addon={addon} />}
        titleActions={
          <Link href="/docs/agents" className={styles.guide}>
            Guide: agent docs
          </Link>
        }
        toolbar={
          <>
            <Button
              variant="toolbar"
              icon={<GameTexture source={ADDON_MEDIA("upleft")} size={14} />}
              onClick={history.undo}
              disabled={!history.canUndo}
              title="Undo (Ctrl/Cmd+Z)"
            >
              Undo
            </Button>
            <Button
              variant="toolbar"
              icon={<GameTexture source={ADDON_MEDIA("upright")} size={14} />}
              onClick={history.redo}
              disabled={!history.canRedo}
              title="Redo (Ctrl/Cmd+Shift+Z)"
            >
              Redo
            </Button>
            <Button
              variant="toolbar"
              icon={<GameTexture source={ADDON_MEDIA("newaura")} size={16} />}
              onClick={() => setCreating(true)}
              disabled={!ready}
              aria-pressed={creating}
            >
              New Aura
            </Button>
            <Popover
              open={importOpen}
              onOpenChange={setImportOpen}
              label="Import"
              trigger={(props) => (
                <Button variant="toolbar" icon={<GameTexture source={ADDON_MEDIA("importsmall")} size={16} />} {...props}>
                  Import
                </Button>
              )}
            >
              <ImportPanel importer={importer} />
            </Popover>
          </>
        }
        list={
          <>
            {ready && core ? (
              <WorkspaceTree
                items={workspace.items}
                selectedId={workspace.selectedId}
                onSelect={select}
                onChange={workspace.setItems}
                internalVersion={core.internalVersion}
                hiddenIds={hiddenIds}
                onToggleHidden={toggleHidden}
              />
            ) : (
              <EmptyNote>Loading…</EmptyNote>
            )}
            {workspace.selectedId ? (
              <div className={styles.exportRow}>
                <Popover
                  open={exportOpen}
                  onOpenChange={setExportOpen}
                  label="Export"
                  trigger={(props) => (
                    <Button size="sm" {...props}>
                      Export
                    </Button>
                  )}
                >
                  <ExportPanel workspace={workspace} />
                </Popover>
              </div>
            ) : (
              // Kept mounted (hidden) with nothing selected, so the state code stays readable.
              <div hidden>
                <ExportPanel workspace={workspace} />
              </div>
            )}
            {aura && !selectedIsGroup && (
              <InspectorSection title="Spell">
                <SpellPicker aura={aura} onAuraChange={changeAura} />
              </InspectorSection>
            )}
            {aura && (
              <InspectorSection title="Situation">
                <SituationControls aura={aura} situation={situation} onChange={setSituation} />
              </InspectorSection>
            )}
            {core && aura && code && (
              <InspectorSection title="Combat check">
                <ValidationPanel core={core} code={code} aura={aura} childAuras={workspace.children} />
              </InspectorSection>
            )}
          </>
        }
        options={
          creating && ready && core ? (
            <NewAuraChooser
              items={workspace.items}
              selectedId={workspace.selectedId}
              internalVersion={core.internalVersion}
              onCreate={(next, id) => {
                workspace.setItems(next, id);
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : core && aura ? (
            <OptionsEditor core={core} aura={aura} childAuras={workspace.children} onChange={changeAura} />
          ) : (
            <div className={styles.emptyOptions}>
              <EmptyNote>{ready ? "Select an aura, or click New Aura." : "Loading Musca Auras…"}</EmptyNote>
            </div>
          )
        }
        footer={
          <>
            <Link href="/docs/agents" className={styles.footerLink}>
              <GameTexture source={ADDON_MEDIA("GitHub")} size={16} />
              Agent docs
            </Link>
            <a href="/llms.txt" className={styles.footerLink}>
              llms.txt
            </a>
            <span className={styles.footerSpacer} />
            <span className={styles.workspace} title="Agents push to this workspace; the window updates live">
              Workspace <code data-testid="workspace-id">{workspace.workspaceId ?? DEFAULT_WORKSPACE_ID}</code>
            </span>
          </>
        }
        stage={
          ready ? (
            <GameScreenStage
              screen={screen}
              notice={
                workspace.notice || workspace.warning ? (
                  <>
                    {workspace.notice && <p className={styles.notice}>{workspace.notice}</p>}
                    {workspace.warning && (
                      <p className={styles.notice} role="status">
                        {workspace.warning}
                      </p>
                    )}
                  </>
                ) : null
              }
            >
              {(ui) => (
                <WorkspaceStage
                  items={workspace.items}
                  situation={situation}
                  screen={ui}
                  selectedId={workspace.selectedId}
                  hiddenIds={hiddenIds}
                  onSelect={select}
                />
              )}
            </GameScreenStage>
          ) : (
            <Stage>
              {addon.error && !core ? (
                <StageMessage tone="danger">
                  Could not load Musca Auras: {addon.error}
                  <br />
                  Pick another version from the window&apos;s title.
                </StageMessage>
              ) : (
                <StageMessage>{core ? "Loading aura…" : "Loading Musca Auras…"}</StageMessage>
              )}
            </Stage>
          )
        }
        drawerMeta={core && <span>Musca Auras {core.ref} · WeakAuras {core.addonVersion}</span>}
        drawerTabs={[
          {
            id: "raw",
            label: "Raw table",
            content: aura ? <RawEditor value={aura} onChange={changeAura} /> : <EmptyNote>No aura selected.</EmptyNote>,
          },
        ]}
        // The only drop handler: files dropped on the window are imported.
        onDropFiles={(files) => {
          setImportOpen(true);
          void importer.importFiles(files);
        }}
      />
    </ToastProvider>
  );
}
