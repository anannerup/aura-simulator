"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { PageSituation } from "@/client/situation";
import { NOT_READY, type EditResult } from "@/client/workspace/session";
import { useUndo } from "@/client/workspace/useUndo";
import { useWorkspace } from "@/client/workspace/useWorkspace";
import { auraRules, type AuraDocument } from "@/core";
import { OptionsEditor } from "@/components/options-editor/OptionsEditor";
import type { EditedAura } from "@/components/options-editor/option-edits";
import { AppShell, EmptyNote, ListSection, ScreenMessage, ScreenPane } from "@/components/shell";
import { SpellPicker } from "@/components/spell-picker/SpellPicker";
import { createSpellApi, SpellApiContext } from "@/components/spell-picker/spell-api";
import { AuraList } from "@/components/aura-list/AuraList";
import { Button, Popover, ToastProvider } from "@/components/ui";
import { ensureFont } from "@/render/fonts";
import { ADDON_MEDIA } from "@/render/media";
import { createIconStore, gameTextureLoader, GameTexture, IconStoreContext, iconsFromApi, TextureLoaderContext } from "@/render/textures";
import { findGame } from "@/games";
import { GameScreenAuras } from "@/render/screen/GameScreenAuras";
import { DEFAULT_WORKSPACE_ID, type WorkspaceNode } from "@/workspace";
import { addonLabel, AddonVersionMenu } from "./addon/AddonVersionPicker";
import { useAddonCore } from "./addon/useAddonCore";
import { ExportPanel, ImportPanel, useImporter } from "./import-export/ImportExport";
import { WagoJsonTab } from "./wago-json/WagoJsonTab";
import { NewAuraChooser } from "./NewAuraChooser";
import { GameScreenPane, useGameScreen } from "./screen/GameScreenPane";
import { SituationControls } from "./SituationControls";
import { useConditionProblems } from "./validation/useConditionProblems";
import { ValidationPanel } from "./validation/ValidationPanel";
import styles from "./AuraSimulator.module.css";

/**
 * The composition root of a game's site (`/<game>`): loads the chosen addon version, follows the game's workspace,
 * and wires each feature into the app shell (`src/components/shell`): the window (title, toolbar, aura list, tabs,
 * footer) beside the game screen.
 */
export function AuraSimulator({ gameId }: { gameId: string }) {
  const game = findGame(gameId);
  if (!game) throw new Error(`No game called "${gameId}"`);
  const api = `/api/${game.id}`;
  const spellApi = useMemo(() => createSpellApi(`${api}/spells`, game), [api, game]);
  const iconStore = useMemo(() => createIconStore(iconsFromApi(`${api}/icons`)), [api]);
  const addon = useAddonCore(game);
  const { core } = addon;
  const rules = auraRules(game.id);
  // The game's addon media (logo, toolbar icons, addon textures and fonts) at the release the window follows.
  const mediaRef = core?.ref ?? game.addon.fallbackRef;
  // Game texture paths (`Interface\Cursor\Cast`, `Interface\Icons\NAME`) load by FileDataID from the game's file list.
  const textures = useMemo(() => gameTextureLoader(game, mediaRef), [game, mediaRef]);
  // The agent docs of the game and the version this window uses.
  const docsQuery = core ? `?ref=${encodeURIComponent(core.ref)}` : "";
  const docs = `/${game.id}/docs/agents${docsQuery}`;
  const [situationStore] = useState(() => new PageSituation());
  const situation = useSyncExternalStore(situationStore.subscribe, situationStore.get, situationStore.get);
  const setSituation = situationStore.set;
  const screen = useGameScreen();
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // The window's title font (Friz Quadrata), from the game files at runtime.
  useEffect(() => ensureFont("Friz Quadrata TT"), []);

  const { view: workspace, session } = useWorkspace(core, game.id, situationStore);
  const importer = useImporter(session);

  // The spell picker replaces the selected aura's document.
  const changeAura = useCallback((aura: AuraDocument): EditResult => session?.updateSelected(aura) ?? NOT_READY, [session]);
  // The tabs' edits come back as the whole top-level aura (an edit can change any aura of it, as in the game).
  const changeTopLevel = useCallback(
    ({ state, selected }: EditedAura): EditResult => session?.updateTopLevel(state, selected) ?? NOT_READY,
    [session],
  );
  const setItems = useCallback(
    (items: WorkspaceNode[], selectedId: string | null): EditResult => session?.setItems(items, selectedId) ?? NOT_READY,
    [session],
  );
  // Undo/redo over the tree and selection, whatever made the change: editors, tree, paste, push.
  const history = useUndo(workspace.items, workspace.selectedId, setItems);
  // Auras hidden in the preview only (as if their trigger were inactive), e.g. to see a dynamic group close up.
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const problems = useConditionProblems(core, workspace.items, game.id);

  const ready = !!core && workspace.ready;
  const aura = ready ? workspace.aura : null;
  const code = ready ? workspace.code : null;
  const selectedIsGroup = aura?.regionType === "group" || aura?.regionType === "dynamicgroup";
  const select = (id: string) => {
    setCreating(false);
    session?.select(id);
  };

  return (
    <ToastProvider>
      <SpellApiContext value={spellApi}>
      <IconStoreContext value={iconStore}>
      <TextureLoaderContext value={textures}>
      <AppShell
        windowLabel={`${game.addon.name} options`}
        portrait={<GameTexture source={game.addon.logo} size={62} />}
        title={
          <>
            <Link href="/" className={styles.gameLink} title="Choose another game">
              {game.name}
            </Link>
            <AddonVersionMenu addon={addon} addonName={game.addon.name} />
          </>
        }
        titleActions={
          <Link href={docs} className={styles.guide}>
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
            {ready ? (
              <AuraList
                items={workspace.items}
                selectedId={workspace.selectedId}
                onSelect={select}
                onChange={setItems}
                hiddenIds={hiddenIds}
                onToggleHidden={toggleHidden}
              />
            ) : (
              <EmptyNote>Loading…</EmptyNote>
            )}
            {session && workspace.selectedId && code && (
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
                  <ExportPanel session={session} name={workspace.selectedId} code={code} />
                </Popover>
              </div>
            )}
            {aura && !selectedIsGroup && (
              <ListSection title="Spell">
                <SpellPicker aura={aura} onAuraChange={changeAura} />
              </ListSection>
            )}
            {aura && (
              <ListSection title="Situation">
                <SituationControls game={game.id} aura={aura} situation={situation} onChange={setSituation} />
              </ListSection>
            )}
            {core && aura && code && (
              // A combat verdict only where the game restricts addons in combat (Forever); else the addon's own checks.
              <ListSection title={rules.combatRestricted ? "Combat check" : "Addon check"}>
                <ValidationPanel core={core} addonName={game.addon.name} code={code} aura={aura} childAuras={workspace.children} />
              </ListSection>
            )}
          </>
        }
        options={
          creating && ready && core && session ? (
            <NewAuraChooser
              game={game.id}
              core={core}
              items={workspace.items}
              selectedId={workspace.selectedId}
              onImport={async (code) => {
                const r = await session.addCode(code);
                if (r.ok) setCreating(false);
                return r;
              }}
              onCreate={async (regionType, sourceData) => {
                const r = await session.createAura(regionType, sourceData);
                if (r.ok) setCreating(false);
                return r;
              }}
              onCancel={() => setCreating(false)}
            />
          ) : core && aura && workspace.topLevel && workspace.selectedId ? (
            <OptionsEditor core={core} topLevel={workspace.topLevel} selected={workspace.selectedId} onChange={changeTopLevel} />
          ) : (
            <div className={styles.emptyOptions}>
              <EmptyNote>{ready ? "Select an aura, or click New Aura." : `Loading ${game.addon.name}…`}</EmptyNote>
            </div>
          )
        }
        footer={
          <>
            <Link href={docs} className={styles.footerLink}>
              <GameTexture source={ADDON_MEDIA("GitHub")} size={16} />
              Agent docs
            </Link>
            <a href={`/${game.id}/llms.txt${docsQuery}`} className={styles.footerLink}>
              llms.txt
            </a>
            <span className={styles.footerSpacer} />
            <span className={styles.workspace} title="Agents push to this workspace; the window updates live">
              Workspace <code data-testid="workspace-id">{workspace.workspaceId ?? DEFAULT_WORKSPACE_ID}</code>
            </span>
          </>
        }
        screen={
          ready ? (
            <GameScreenPane
              screen={screen}
              notice={
                workspace.warning ? (
                  <p className={styles.notice} role="status">
                    {workspace.warning}
                  </p>
                ) : null
              }
            >
              {(ui) => (
                <GameScreenAuras
                  game={game.id}
                  items={workspace.items}
                  situation={situation}
                  screen={ui}
                  selectedId={workspace.selectedId}
                  hiddenIds={hiddenIds}
                  problems={problems}
                  onSelect={select}
                />
              )}
            </GameScreenPane>
          ) : (
            <ScreenPane>
              {addon.error && !core ? (
                <ScreenMessage tone="danger">
                  Could not load {game.addon.name}: {addon.error}
                  <br />
                  Pick another version from the window&apos;s title.
                </ScreenMessage>
              ) : (
                <ScreenMessage>{core ? "Loading aura…" : `Loading ${game.addon.name}…`}</ScreenMessage>
              )}
            </ScreenPane>
          )
        }
        drawerMeta={core && <span>{addonLabel(game.addon.name, core)}</span>}
        drawerTabs={[
          {
            id: "json",
            label: "JSON",
            content:
              session && workspace.selectedId && code ? (
                <WagoJsonTab session={session} code={code} />
              ) : (
                <EmptyNote>No aura selected.</EmptyNote>
              ),
          },
        ]}
        // The only drop handler: files dropped on the window are imported.
        onDropFiles={(files) => {
          setImportOpen(true);
          void importer.importFiles(files);
        }}
      />
      </TextureLoaderContext>
      </IconStoreContext>
      </SpellApiContext>
    </ToastProvider>
  );
}
