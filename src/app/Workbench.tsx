"use client";

import { useCallback, useMemo, useState } from "react";
import { sampleIconAura, type AuraDocument } from "@/core";
import { SpellPicker } from "@/components/spell-picker/SpellPicker";
import { WorkspaceTree } from "@/components/workspace-tree/WorkspaceTree";
import { WorkspaceStage } from "@/render/group/WorkspaceStage";
import { DEFAULT_SITUATION } from "@/render/situation";
import { AddonVersionPicker } from "./_addon/AddonVersionPicker";
import { useAddonCore } from "./_addon/useAddonCore";
import { GameScreen } from "./screen/GameScreen";
import styles from "./page.module.css";
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

  // Edits (e.g. picking a spell) replace the selected item's document; the address, storage and server follow.
  const updateSelected = workspace.updateSelected;
  const changeAura = useCallback((aura: AuraDocument) => void updateSelected(aura), [updateSelected]);
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
        <GameScreen>
          {(ui) => (
            <WorkspaceStage
              items={workspace.items}
              situation={DEFAULT_SITUATION}
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
