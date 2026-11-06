"use client";

import { useCallback, useMemo, useState } from "react";
import { sampleIconAura, type AuraDocument } from "@/core";
import { SpellPicker } from "@/components/spell-picker/SpellPicker";
import { AuraPreview } from "@/render/AuraPreview";
import { DEFAULT_SITUATION } from "@/render/situation";
import { AddonVersionPicker } from "./_addon/AddonVersionPicker";
import { useAddonCore } from "./_addon/useAddonCore";
import { GameScreen } from "./screen/GameScreen";
import styles from "./page.module.css";
import { useWorkspace } from "./workspace/useWorkspace";
import { WorkspacePanel } from "./workspace/WorkspacePanel";

/** The app shell: loads the chosen addon version in the browser, previews the workspace's aura, offers its state code. */
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

  // Edits (e.g. picking a spell) go through the workspace, so the address, storage and server follow.
  const load = workspace.load;
  const changeAura = useCallback(
    (aura: AuraDocument) => {
      if (core) load(core.encode({ aura, children: [] }));
    },
    [core, load],
  );

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
        <GameScreen>{(ui) => <AuraPreview aura={workspace.aura!} situation={DEFAULT_SITUATION} screen={ui} />}</GameScreen>
      </section>
      <SpellPicker aura={workspace.aura} onAuraChange={changeAura} />
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
