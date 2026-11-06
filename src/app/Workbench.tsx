"use client";

import { useCallback, useMemo, useState } from "react";
import { sampleIconAura, type AuraDocument } from "@/core";
import { RawEditor } from "@/components/raw-editor/RawEditor";
import {
  AppShell,
  Brand,
  EmptyNote,
  InspectorSection,
  Stage,
  StageMessage,
  TopBarDivider,
  TopBarGroup,
  TopBarSpacer,
} from "@/components/shell";
import { SpellPicker } from "@/components/spell-picker/SpellPicker";
import { WorkspaceTree } from "@/components/workspace-tree/WorkspaceTree";
import { Button, CopyIcon, IconButton, LayersIcon, RedoIcon, ShieldIcon, SparkIcon, ToastProvider, UndoIcon } from "@/components/ui";
import { WorkspaceStage } from "@/render/group/WorkspaceStage";
import { DEFAULT_SITUATION } from "@/render/situation";
import { AddonVersionMenu } from "./_addon/AddonVersionPicker";
import { useAddonCore } from "./_addon/useAddonCore";
import { GameScreenStage, useGameScreen } from "./screen/GameScreen";
import { SituationControls } from "./SituationControls";
import { CopyCodeButton, STATE_CODE_TAB, StateCodeDrawer, StateCodePill } from "./StateCode";
import { ValidationPanel } from "./validation/ValidationPanel";
import type { LoadResult } from "./workspace/session";
import { useUndo } from "./workspace/useUndo";
import { useWorkspace } from "./workspace/useWorkspace";
import { WorkspaceBadge, WorkspaceMenu, WorkspaceNotice } from "./workspace/WorkspacePanel";
import styles from "./Workbench.module.css";

/**
 * The composition root: loads the chosen addon version, follows the workspace, and wires each feature's panel into
 * a slot of the app shell (`src/components/shell`). To add a panel, mount it in its slot below.
 */
export function Workbench() {
  const addon = useAddonCore();
  const { core } = addon;
  const [situation, setSituation] = useState(DEFAULT_SITUATION);
  const screen = useGameScreen();

  // The sample aura is only the fallback when nothing else (address, storage, server) has an aura.
  const fallbackCode = useMemo(() => {
    if (!core) return null;
    const aura: AuraDocument = sampleIconAura(core.internalVersion);
    return core.encode({ aura, children: [] });
  }, [core]);
  const workspace = useWorkspace(core, fallbackCode);

  // Edits (spell picker, raw table) replace the selected item's document; address, storage and server follow.
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

  return (
    <ToastProvider>
      <AppShell
        brand={<Brand name="Aura Simulator" />}
        topBar={
          <>
            <AddonVersionMenu addon={addon} />
            <TopBarGroup hideBelow="tablet">
              <TopBarDivider />
              <WorkspaceBadge workspace={workspace} />
            </TopBarGroup>
            <TopBarSpacer />
            <TopBarGroup>
              <IconButton label="Undo" tooltip="Undo (Ctrl/Cmd+Z)" icon={<UndoIcon />} onClick={history.undo} disabled={!history.canUndo} />
              <IconButton
                label="Redo"
                tooltip="Redo (Ctrl/Cmd+Shift+Z)"
                icon={<RedoIcon />}
                onClick={history.redo}
                disabled={!history.canRedo}
              />
              <TopBarDivider />
              <WorkspaceMenu workspace={workspace} />
              {code ? (
                <>
                  <StateCodePill code={code} />
                  <CopyCodeButton code={code} />
                </>
              ) : (
                <Button variant="primary" icon={<CopyIcon size={14} />} disabled>
                  Copy
                </Button>
              )}
            </TopBarGroup>
          </>
        }
        left={
          <>
            <InspectorSection title="Workspace" icon={<LayersIcon size={14} />}>
              {ready && core ? (
                <WorkspaceTree
                  items={workspace.items}
                  selectedId={workspace.selectedId}
                  onSelect={workspace.select}
                  onChange={workspace.setItems}
                  internalVersion={core.internalVersion}
                  hiddenIds={hiddenIds}
                  onToggleHidden={toggleHidden}
                />
              ) : (
                <EmptyNote>Loading…</EmptyNote>
              )}
            </InspectorSection>
            {aura && !selectedIsGroup && (
              <InspectorSection title="Trigger spell">
                <SpellPicker aura={aura} onAuraChange={changeAura} />
              </InspectorSection>
            )}
          </>
        }
        stage={
          ready ? (
            <GameScreenStage screen={screen} notice={<WorkspaceNotice workspace={workspace} />}>
              {(ui) => (
                <WorkspaceStage
                  items={workspace.items}
                  situation={situation}
                  screen={ui}
                  selectedId={workspace.selectedId}
                  hiddenIds={hiddenIds}
                  onSelect={workspace.select}
                />
              )}
            </GameScreenStage>
          ) : (
            <Stage>
              {addon.error && !core ? (
                <StageMessage tone="danger">
                  Could not load Musca Auras: {addon.error}
                  <br />
                  Pick another version from the menu at the top.
                </StageMessage>
              ) : (
                <StageMessage>{core ? "Loading aura…" : "Loading Musca Auras…"}</StageMessage>
              )}
            </Stage>
          )
        }
        inspector={
          <>
            {/* Slot: the editor tabs (Display, Trigger, Conditions, Actions, Animations, Load; ticket 10) go first. */}
            {aura && (
              <InspectorSection title="Situation" icon={<SparkIcon size={14} />}>
                <SituationControls aura={aura} situation={situation} onChange={setSituation} />
              </InspectorSection>
            )}
            {core && aura && code && (
              <InspectorSection title="Checks" icon={<ShieldIcon size={14} />}>
                <ValidationPanel core={core} code={code} aura={aura} childAuras={workspace.children} />
              </InspectorSection>
            )}
            {/* The game screen's settings are in the stage toolbar's popover (set once, then left alone). */}
          </>
        }
        drawerMeta={
          core && (
            <>
              <h2 className={styles.codeHeading}>State code{workspace.selectedId ? ` of ${workspace.selectedId}` : ""}</h2>
              <span className={styles.version}>
                Musca Auras {core.ref} · WeakAuras {core.addonVersion}
              </span>
            </>
          )
        }
        drawerTabs={[
          {
            id: STATE_CODE_TAB,
            label: "Full code",
            content: <StateCodeDrawer code={code ?? ""} />,
          },
          {
            id: "raw",
            label: "Raw table",
            content: aura ? <RawEditor value={aura} onChange={changeAura} /> : <EmptyNote>No aura selected.</EmptyNote>,
          },
        ]}
      />
    </ToastProvider>
  );
}
