"use client";

import { useState, type FormEvent } from "react";
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
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="addon-release">Musca Auras version</label>
          <select
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
          </select>
        </div>
        <form className={styles.field} onSubmit={submit}>
          <label htmlFor="addon-custom-ref">Branch or commit</label>
          <span className={styles.inline}>
            <input
              id="addon-custom-ref"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="main, forever-spell-ids, 448b7b3…"
              list="addon-branches"
              spellCheck={false}
            />
            <datalist id="addon-branches">
              {versions?.branches.map((b) => <option key={b} value={b} />)}
            </datalist>
            <button type="submit" disabled={busy || !custom.trim()}>
              Load
            </button>
          </span>
        </form>
      </div>

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
        <p className={styles.error} role="alert">
          {error}
          {core && ` Still using ${core.ref}.`}
        </p>
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
