"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuraCore, AuraDocument } from "@/core";
import { SpellPicker } from "@/components/spell-picker/SpellPicker";
import { AuraPreview } from "@/render/AuraPreview";
import { DEFAULT_SITUATION } from "@/render/situation";
import { GameScreen } from "./screen/GameScreen";
import styles from "./page.module.css";

type Loaded = { core: AuraCore; aura: AuraDocument; code: string };

/** The app shell: loads the aura core in the browser, previews the sample aura, offers its state code. */
export function Workbench() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { loadAddon, sampleIconAura, DEFAULT_ADDON_REF } = await import("@/core");
      const core = await loadAddon(DEFAULT_ADDON_REF, { wasmUri: "/lua/liblua5.1.wasm" });
      const aura = sampleIconAura(core.internalVersion);
      const code = core.encode({ aura, children: [] });
      if (!cancelled) setLoaded({ core, aura, code });
    })().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy() {
    if (!loaded) return;
    await navigator.clipboard.writeText(loaded.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const changeAura = useCallback((aura: AuraDocument) => {
    setLoaded((l) => l && { ...l, aura, code: l.core.encode({ aura, children: [] }) });
  }, []);

  if (error) return <p className={styles.error}>Could not load Musca Auras: {error}</p>;
  if (!loaded) return <p className={styles.status}>Loading Musca Auras…</p>;

  return (
    <>
      <section className={styles.previewArea}>
        <GameScreen>{(ui) => <AuraPreview aura={loaded.aura} situation={DEFAULT_SITUATION} screen={ui} />}</GameScreen>
      </section>
      <SpellPicker aura={loaded.aura} onAuraChange={changeAura} />
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
