"use client";

import { useCallback, useMemo, useState } from "react";
import { sampleIconAura, type AuraDocument } from "@/core";
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
import { Button, CopyIcon, LayersIcon, MonitorIcon, SparkIcon, ToastProvider } from "@/components/ui";
import { AuraPreview } from "@/render/AuraPreview";
import { DEFAULT_SITUATION } from "@/render/situation";
import { AddonVersionMenu } from "./_addon/AddonVersionPicker";
import { useAddonCore } from "./_addon/useAddonCore";
import { AuraList } from "./AuraList";
import { GameScreenSettings, GameScreenStage, useGameScreen } from "./screen/GameScreen";
import { SituationControls } from "./SituationControls";
import { CopyCodeButton, StateCodeDrawer, StateCodePill } from "./StateCode";
import { useWorkspace } from "./workspace/useWorkspace";
import { WorkspaceBadge, WorkspacePanel } from "./workspace/WorkspacePanel";

/**
 * The composition root: loads the chosen addon version, follows the workspace, and wires each feature's panel into
 * a slot of the app shell. To add a panel, mount it in its slot below; the slots marked "Slot:" are reserved.
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

  // Edits (e.g. picking a spell) go through the workspace, so the address, storage and server follow.
  const load = workspace.load;
  const changeAura = useCallback(
    (aura: AuraDocument) => {
      if (core) load(core.encode({ aura, children: [] }));
    },
    [core, load],
  );

  const aura = core ? workspace.aura : null;
  const code = core ? workspace.code : null;

  return (
    <ToastProvider>
      <AppShell
        brand={<Brand name="Aura Simulator" />}
        topBar={
          <>
            {/* Slot: addon version (ticket 04). */}
            <AddonVersionMenu addon={addon} />
            <TopBarGroup hideBelow="tablet">
              <TopBarDivider />
              {/* Slot: workspace id (ticket 02). */}
              <WorkspaceBadge workspace={workspace} />
            </TopBarGroup>
            <TopBarSpacer />
            <TopBarGroup>
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
              {/* Slot: Export/Import menu (workspace file, ticket 12) goes here, after Copy. */}
            </TopBarGroup>
          </>
        }
        left={
          <>
            <InspectorSection title="Auras" icon={<LayersIcon size={14} />}>
              {aura ? <AuraList auras={[aura]} /> : <EmptyNote>Loading…</EmptyNote>}
            </InspectorSection>
            {aura && (
              <InspectorSection title="Trigger spell">
                <SpellPicker aura={aura} onAuraChange={changeAura} />
              </InspectorSection>
            )}
            <InspectorSection title="Paste a code">
              {/* Slot: paste a code (ticket 02). */}
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
            {/* Slot: editor tabs (Display, Trigger, Conditions, Actions, Animations, Load; ticket 10) go first. */}
            {aura && (
              <InspectorSection title="Situation" icon={<SparkIcon size={14} />}>
                <SituationControls aura={aura} situation={situation} onChange={setSituation} />
              </InspectorSection>
            )}
            {/* Slot: warnings (ticket 05): <InspectorSection title="Warnings" meta={<Badge tone="warn">n</Badge>}>…</InspectorSection> */}
            <InspectorSection title="Game screen" icon={<MonitorIcon size={14} />}>
              <GameScreenSettings screen={screen} />
            </InspectorSection>
          </>
        }
        drawerTitle="State code"
        drawerMeta={core && <span>Musca Auras {core.ref} · WeakAuras {core.addonVersion}</span>}
        drawer={code ? <StateCodeDrawer code={code} /> : <p>Loading…</p>}
      />
    </ToastProvider>
  );
}
