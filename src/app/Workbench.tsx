"use client";

import { useCallback, useMemo, useState } from "react";
import { sampleIconAura, type AuraDocument } from "@/core";
import { RawEditor } from "@/components/raw-editor/RawEditor";
import { SpellPicker } from "@/components/spell-picker/SpellPicker";
import { WorkspaceTree } from "@/components/workspace-tree/WorkspaceTree";
import { WorkspaceStage } from "@/render/group/WorkspaceStage";
import { DEFAULT_SITUATION } from "@/render/situation";
import { AddonVersionPicker } from "./_addon/AddonVersionPicker";
import { useAddonCore } from "./_addon/useAddonCore";
import { GameScreen } from "./screen/GameScreen";
import { SituationControls } from "./SituationControls";
import { ValidationPanel } from "./validation/ValidationPanel";
import styles from "./page.module.css";
import { useUndo } from "./workspace/useUndo";
import type { LoadResult } from "./workspace/session";
import { useWorkspace } from "./workspace/useWorkspace";
import { WorkspacePanel } from "./workspace/WorkspacePanel";

/**
 * The app shell: loads the chosen addon version in the browser, draws every aura of the workspace, and offers the
 * selected item's state code.
 */
export function Workbench() {
  const addon = useAddonCore();
  const { core } = addon;
  const [copied, setCopied] = useState(false);
  const [situation, setSituation] = useState(DEFAULT_SITUATION);

  // The sample aura is only the fallback when nothing else (address, storage, server) has an aura.
  const fallbackCode = useMemo(() => {
    if (!core) return null;
    const aura: AuraDocument = sampleIconAura(core.internalVersion);
    return core.encode({ aura, children: [] });
  }, [core]);
  const workspace = useWorkspace(core, fallbackCode);

  async function copy() {
    if (!workspace.code) return;
    await navigator.clipboard.writeText(workspace.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

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

  const picker = <AddonVersionPicker addon={addon} />;
  if (!core) return picker;
  if (!workspace.ready) {
    return (
      <>
        {picker}
        <p className={styles.status}>Loading aura…</p>
      </>
    );
  }
  const selectedIsGroup = workspace.aura?.regionType === "group" || workspace.aura?.regionType === "dynamicgroup";

  return (
    <>
      {picker}
      <section className={styles.previewArea}>
        <div className={styles.history}>
          <button type="button" onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl/Cmd+Z)">
            Undo
          </button>
          <button type="button" onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
            Redo
          </button>
        </div>
        <GameScreen>
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
        </GameScreen>
      </section>
      <WorkspaceTree
        items={workspace.items}
        selectedId={workspace.selectedId}
        onSelect={workspace.select}
        onChange={workspace.setItems}
        internalVersion={core.internalVersion}
        hiddenIds={hiddenIds}
        onToggleHidden={toggleHidden}
      />
      {workspace.aura && !selectedIsGroup && <SpellPicker aura={workspace.aura} onAuraChange={changeAura} />}
      {workspace.aura && <SituationControls aura={workspace.aura} situation={situation} onChange={setSituation} />}
      {workspace.aura && workspace.code && (
        <ValidationPanel core={core} code={workspace.code} aura={workspace.aura} childAuras={workspace.children} />
      )}
      {workspace.aura && <RawEditor value={workspace.aura} onChange={changeAura} />}
      <section className={styles.export}>
        <div className={styles.exportHeader}>
          <h2>State code{workspace.selectedId ? ` of ${workspace.selectedId}` : ""}</h2>
          <span className={styles.meta}>
            Musca Auras {core.ref} (WeakAuras {core.addonVersion})
          </span>
          <button type="button" onClick={copy} className={styles.copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <textarea className={styles.code} readOnly value={workspace.code ?? ""} aria-label="State code" rows={4} />
      </section>
      <WorkspacePanel workspace={workspace} />
    </>
  );
}
