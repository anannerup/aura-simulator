"use client";

import { useState, type FormEvent } from "react";
import { Button, Callout, ChevronDownIcon, Field, Input, Popover, Select, WarningIcon } from "@/components/ui";
import type { AddonCoreState } from "./useAddonCore";
import styles from "./AddonVersionPicker.module.css";

/** Picks the Musca Auras version the app follows: a release from the list, or any branch or commit. */
export function AddonVersionPicker({ addon }: { addon: AddonCoreState }) {
  const { core, resolution, loadingRef, error, versions, diff, load } = addon;
  const [custom, setCustom] = useState("");
  const releases = versions?.releases ?? [];
  const selectedTag = core ? releases.find((r) => r.tag === core.ref || r.version === core.ref.replace(/^v/, ""))?.tag : undefined;
  const busy = loadingRef !== null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (custom.trim()) load(custom.trim());
  }

  return (
    <section className={styles.picker} aria-label="Addon version picker">
      <Field label="Musca Auras version" htmlFor="addon-release">
        <Select
          id="addon-release"
          value={selectedTag ?? ""}
          disabled={busy || releases.length === 0}
          onChange={(e) => e.target.value && load(e.target.value)}
        >
          {!selectedTag && <option value="">{core ? `${core.ref} (branch or commit)` : "…"}</option>}
          {releases.map((r) => (
            <option key={r.tag} value={r.tag}>
              {r.tag}
              {r.prerelease ? " (pre-release)" : ""}
              {r.tag === versions?.defaultRef ? " (newest)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <form onSubmit={submit}>
        <Field label="Branch or commit" htmlFor="addon-custom-ref">
          <span className={styles.inline}>
            <Input
              id="addon-custom-ref"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="main, forever-spell-ids, 448b7b3…"
              list="addon-branches"
              spellCheck={false}
              mono
            />
            <datalist id="addon-branches">
              {versions?.branches.map((b) => <option key={b} value={b} />)}
            </datalist>
            <Button type="submit" disabled={busy || !custom.trim()}>
              Switch
            </Button>
          </span>
        </Field>
      </form>

      <p className={styles.status} data-testid="addon-loaded">
        {core ? (
          <>
            Musca Auras {core.ref}
            {resolution && resolution.kind !== "release" && resolution.sha && ` (${resolution.sha.slice(0, 7)})`} · WeakAuras{" "}
            {core.addonVersion} · internal version {core.internalVersion}
          </>
        ) : (
          !error && "Loading Musca Auras…"
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
export function AddonVersionMenu({ addon }: { addon: AddonCoreState }) {
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
          <span className={styles.triggerLabel}>Musca Auras</span>
          <span className={styles.triggerValue}>{core?.ref ?? "…"}</span>
          {loadingRef ? <span className={styles.spinner} aria-hidden /> : error ? <WarningIcon size={13} className={styles.triggerWarn} /> : null}
          <ChevronDownIcon size={14} className={styles.triggerChevron} />
        </button>
      )}
    >
      <AddonVersionPicker addon={addon} />
    </Popover>
  );
}
