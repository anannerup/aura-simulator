"use client";

import { useMemo, useState } from "react";
import { sampleIconAura, type AuraDocument } from "@/core";
import { AuraPreview } from "@/render/AuraPreview";
import { DEFAULT_SITUATION } from "@/render/situation";
import { AddonVersionPicker } from "./_addon/AddonVersionPicker";
import { useAddonCore } from "./_addon/useAddonCore";
import styles from "./page.module.css";

/** The app shell: loads the aura core in the browser, previews the sample aura, offers its state code. */
export function Workbench() {
  const addon = useAddonCore();
  const { core } = addon;
  const [copied, setCopied] = useState(false);

  // The current aura, re-encoded by whichever addon version is loaded.
  const loaded = useMemo(() => {
    if (!core) return null;
    const aura: AuraDocument = sampleIconAura(core.internalVersion);
    return { core, aura, code: core.encode({ aura, children: [] }) };
  }, [core]);

  async function copy() {
    if (!loaded) return;
    await navigator.clipboard.writeText(loaded.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const picker = <AddonVersionPicker addon={addon} />;
  if (!loaded) return picker;

  return (
    <>
      {picker}
      <section className={styles.previewArea}>
        <AuraPreview aura={loaded.aura} situation={DEFAULT_SITUATION} />
      </section>
      <section className={styles.export}>
        <div className={styles.exportHeader}>
          <h2>State code</h2>
          <span className={styles.meta}>
            Musca Auras {loaded.core.ref} (WeakAuras {loaded.core.addonVersion})
          </span>
          <button type="button" onClick={copy} className={styles.copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <textarea className={styles.code} readOnly value={loaded.code} aria-label="State code" rows={4} />
      </section>
    </>
  );
}
