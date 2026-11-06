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
import {
  Button,
  CopyIcon,
  IconButton,
  LayersIcon,
  RedoIcon,
  ShieldIcon,
  SparkIcon,
  ToastProvider,
  UndoIcon,
} from "@/components/ui";
import { AuraPreview } from "@/render/AuraPreview";
import { DEFAULT_SITUATION } from "@/render/situation";
import { AddonVersionMenu } from "./_addon/AddonVersionPicker";
import { useAddonCore } from "./_addon/useAddonCore";
import { AuraList } from "./AuraList";
import { GameScreenStage, useGameScreen } from "./screen/GameScreen";
import { SituationControls } from "./SituationControls";
import { CopyCodeButton, STATE_CODE_TAB, StateCodeDrawer, StateCodePill } from "./StateCode";
import { ValidationPanel } from "./validation/ValidationPanel";
import type { LoadResult } from "./workspace/session";
import { useUndo } from "./workspace/useUndo";
import { useWorkspace } from "./workspace/useWorkspace";
import { WorkspaceBadge, WorkspacePanel } from "./workspace/WorkspacePanel";

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

  // Edits (e.g. picking a spell, the raw table) go through the workspace, so the address, storage,
  // server and undo history follow.
  const { load, children } = workspace;
  const changeAura = useCallback(
    (aura: AuraDocument): LoadResult => {
      if (!core) return { ok: false, error: "The addon is still loading" };
      try {
        return load(core.encode({ aura, children }));
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [core, load, children],
  );
  const history = useUndo(workspace.code, load);

  const aura = core ? workspace.aura : null;
  const code = core ? workspace.code : null;

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
              {/* Slot: an Export/Import menu (workspace file, ticket 12) goes here, after Copy. */}
            </TopBarGroup>
          </>
        }
        left={
          <>
            <InspectorSection title="Auras" icon={<LayersIcon size={14} />}>
              {/* Slot: the workspace tree (groups, ticket 12) replaces this list. */}
              {aura ? <AuraList auras={[aura]} /> : <EmptyNote>Loading…</EmptyNote>}
            </InspectorSection>
            {aura && (
              <InspectorSection title="Trigger spell">
                <SpellPicker aura={aura} onAuraChange={changeAura} />
              </InspectorSection>
            )}
            <InspectorSection title="Paste a code">
              <WorkspacePanel workspace={workspace} />
            </InspectorSection>
          </>
        }
        stage={
          aura && code ? (
            <GameScreenStage screen={screen}>
              {(ui) => <AuraPreview aura={aura} situation={situation} screen={ui} />}
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
        drawerMeta={core && <span>Musca Auras {core.ref} · WeakAuras {core.addonVersion}</span>}
        drawerTabs={[
          {
            id: STATE_CODE_TAB,
            label: "State code",
            content: code ? <StateCodeDrawer code={code} /> : <EmptyNote>Loading…</EmptyNote>,
          },
          {
            id: "raw",
            label: "Raw table",
            content: aura ? <RawEditor value={aura} onChange={changeAura} /> : <EmptyNote>Loading…</EmptyNote>,
          },
        ]}
      />
    </ToastProvider>
  );
}
