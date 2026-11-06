"use client";

import { useCallback, useMemo, useState } from "react";
import { sampleIconAura, type AuraDocument } from "@/core";
import { OptionsEditor } from "@/components/options-editor/OptionsEditor";
import { RawEditor } from "@/components/raw-editor/RawEditor";
import { SpellPicker } from "@/components/spell-picker/SpellPicker";
import { AuraPreview } from "@/render/AuraPreview";
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

/** The app shell: loads the chosen addon version in the browser, previews the workspace's aura, offers its state code. */
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

  const picker = <AddonVersionPicker addon={addon} />;
  if (!core) return picker;
  if (!workspace.aura || !workspace.code) {
    return (
      <>
        {picker}
        <p className={styles.status}>Loading aura…</p>
      </>
    );
  }

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
        <GameScreen>{(ui) => <AuraPreview aura={workspace.aura!} situation={situation} screen={ui} />}</GameScreen>
      </section>
      <SituationControls aura={workspace.aura} situation={situation} onChange={setSituation} />
      <ValidationPanel core={core} code={workspace.code} aura={workspace.aura} childAuras={workspace.children} />
      <SpellPicker aura={workspace.aura} onAuraChange={changeAura} />
      <OptionsEditor core={core} aura={workspace.aura} childAuras={workspace.children} onChange={changeAura} />
      <RawEditor value={workspace.aura} onChange={changeAura} />
      <section className={styles.export}>
        <div className={styles.exportHeader}>
          <h2>State code</h2>
          <span className={styles.meta}>
            Musca Auras {core.ref} (WeakAuras {core.addonVersion})
          </span>
          <button type="button" onClick={copy} className={styles.copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <textarea className={styles.code} readOnly value={workspace.code} aria-label="State code" rows={4} />
      </section>
      <WorkspacePanel workspace={workspace} />
    </>
  );
}
