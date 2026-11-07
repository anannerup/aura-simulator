"use client";

import { useState } from "react";
import { Callout, ChevronDownIcon, Field, Popover, Select, WarningIcon } from "@/components/ui";
import type { AddonCoreState } from "./useAddonCore";
import styles from "./AddonVersionPicker.module.css";

/** Picks the release of the game's addon the app follows (released tags only). */
function AddonVersionPicker({ addon, addonName }: { addon: AddonCoreState; addonName: string }) {
  const { core, loadingRef, error, versions, diff, load } = addon;
  const releases = versions?.releases ?? [];
  const selectedTag = core ? releases.find((r) => r.tag === core.ref)?.tag : undefined;
  const busy = loadingRef !== null;

  return (
    <section className={styles.picker} aria-label="Addon version picker">
      <Field label={`${addonName} version`} htmlFor="addon-release">
        <Select
          id="addon-release"
          value={selectedTag ?? ""}
          disabled={busy || releases.length === 0}
          onChange={(e) => e.target.value && load(e.target.value)}
        >
          {!selectedTag && <option value="">{core?.ref ?? "…"}</option>}
          {releases.map((r) => (
            <option key={r.tag} value={r.tag}>
              {r.tag}
              {r.prerelease ? " (pre-release)" : ""}
              {r.tag === versions?.defaultRef ? " (newest)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      <p className={styles.status} data-testid="addon-loaded">
        {core ? (
          <>
            {addonName} {core.ref} · WeakAuras {core.addonVersion} · internal version {core.internalVersion}
          </>
        ) : (
          !error && `Loading ${addonName}…`
        )}
        {loadingRef && core && <span className={styles.loading}> · loading {loadingRef}…</span>}
      </p>
      {error && (
        <Callout tone="danger" icon={<WarningIcon size={14} />} role="alert">
          {error}
          {core && ` Still using ${core.ref}.`}
        </Callout>
      )}
      {versions && !versions.tagsConfirmed && (
        <p className={styles.note}>GitHub didn&apos;t answer, so release names may lack their &quot;v&quot; prefix.</p>
      )}

      {diff && (
        <details className={styles.diff} open data-testid="addon-diff">
          <summary>
            What changed from {diff.from} to {diff.to}
          </summary>
          {!diff.result && !diff.error && <p className={styles.note}>Comparing versions…</p>}
          {diff.error && <p className={styles.error}>Could not compare: {diff.error}</p>}
          {diff.result && (
            <>
              <ul>
                {diff.result.summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {diff.result.changelog && (
                <details>
                  <summary>Changelog</summary>
                  <pre className={styles.changelog}>{diff.result.changelog}</pre>
                </details>
              )}
            </>
          )}
        </details>
      )}
    </section>
  );
}

/**
 * The version picker for the top bar: a compact button showing the loaded version that opens the picker below it.
 * It opens by itself when no version could be loaded at all.
 */
export function AddonVersionMenu({ addon, addonName }: { addon: AddonCoreState; addonName: string }) {
  const [open, setOpen] = useState(false);
  const { core, loadingRef, error } = addon;
  const forcedOpen = !core && !!error;
  return (
    <Popover
      open={open || forcedOpen}
      onOpenChange={setOpen}
      label="Choose the addon version"
      trigger={(props) => (
        <button type="button" className={styles.trigger} {...props} title="Addon version">
          <span className={styles.triggerLabel}>{addonName}</span>
          <span className={styles.triggerValue}>{core?.ref ?? "…"}</span>
          {loadingRef ? <span className={styles.spinner} aria-hidden /> : error ? <WarningIcon size={13} className={styles.triggerWarn} /> : null}
          <ChevronDownIcon size={14} className={styles.triggerChevron} />
        </button>
      )}
    >
      <AddonVersionPicker addon={addon} addonName={addonName} />
    </Popover>
  );
}
