"use client";

import { useEffect, useState } from "react";
import { getSpellStatus, syncSpells, type SpellCacheStatus } from "./spell-api";
import styles from "./SpellPicker.module.css";

/**
 * Spell cache status: a first-run prompt when the spell list was never downloaded, else a small
 * line with the build and last sync time. Both offer a sync (takes a few seconds; wago.tools).
 */
export function SpellSync({ onSynced }: { onSynced?: () => void }) {
  const [status, setStatus] = useState<SpellCacheStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSpellStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      await syncSpells();
      setStatus(await getSpellStatus());
      onSynced?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  const button = (
    <button type="button" className={styles.syncButton} onClick={sync} disabled={syncing}>
      {syncing ? "Syncing…" : "Sync spells"}
    </button>
  );

  if (status && !status.synced) {
    return (
      <div className={styles.syncPrompt} role="region" aria-label="Spell list not downloaded">
        <p>
          The spell list hasn&apos;t been downloaded yet. Sync once to search WoW Forever&apos;s spells by name and
          show their icons.
        </p>
        {button}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.syncLine} data-testid="spell-sync">
      <span>
        {status?.synced
          ? `Spells: build ${status.build}, ${status.spellCount.toLocaleString()} spells, synced ${new Date(status.syncedAt!).toLocaleString()}`
          : "Spells: …"}
      </span>
      {button}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
