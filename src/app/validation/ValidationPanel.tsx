"use client";

import { useEffect, useState } from "react";
import type { AddonVMReport, AuraCore, AuraDocument, ValidationMessage, ValidationResult } from "@/core";
import styles from "./ValidationPanel.module.css";

type Check =
  | { state: "loading" }
  | { state: "done"; result: ValidationResult; timings: AddonVMReport["timings"] }
  | { state: "failed"; error: string };

const HEADLINE: Record<ValidationResult["combat"]["status"], string> = {
  ok: "Works in combat",
  limited: "Partly works in combat",
  broken: "Won't work",
};

/**
 * The addon's own validation and combat warnings for the current aura. Information only: export is
 * never blocked. Runs in the full addon VM (a Web Worker), which loads on first use.
 */
export function ValidationPanel({
  core,
  code,
  aura,
  childAuras,
}: {
  core: AuraCore;
  /** The state code, used as the key: validation reruns when it changes. */
  code: string;
  aura: AuraDocument;
  childAuras: AuraDocument[];
}) {
  const [check, setCheck] = useState<Check & { key: string }>({ state: "loading", key: "" });

  useEffect(() => {
    let cancelled = false;
    const key = `${core.ref}\n${code}`;
    (async () => {
      const report = await core.loadFullAddon();
      const result = await core.validate({ aura, children: childAuras });
      if (!cancelled) setCheck({ state: "done", result, timings: report.timings, key });
    })().catch((e: unknown) => {
      if (!cancelled) setCheck({ state: "failed", error: e instanceof Error ? e.message : String(e), key });
    });
    return () => {
      cancelled = true;
    };
    // aura/childAuras follow code; rerunning on their identity would validate twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, code]);

  const current = check.key === `${core.ref}\n${code}` ? check : { state: "loading" as const };

  return (
    <section
      className={styles.panel}
      data-testid="validation-panel"
      data-state={current.state}
      data-combat-status={current.state === "done" ? current.result.combat.status : undefined}
      data-vm-timings={current.state === "done" ? JSON.stringify(current.timings) : undefined}
      aria-live="polite"
    >
      <h2 className={styles.title}>Checks</h2>
      {current.state === "loading" && <p className={styles.muted}>Checking with Musca Auras&apos; own rules…</p>}
      {current.state === "failed" && <p className={styles.error}>Could not check this aura: {current.error}</p>}
      {current.state === "done" && <Result result={current.result} />}
    </section>
  );
}

function Result({ result }: { result: ValidationResult }) {
  const { combat } = result;
  return (
    <>
      <div className={`${styles.combat} ${styles[combat.status]}`} data-testid="combat-status">
        <strong>{HEADLINE[combat.status]}</strong>
        {combat.messages.map((m, i) => (
          <span key={i}>{m}</span>
        ))}
      </div>
      {(result.errors.length > 0 || result.warnings.length > 0) && (
        <ul className={styles.list}>
          {result.errors.map((m, i) => (
            <Item key={`e${i}`} message={m} />
          ))}
          {result.warnings.map((m, i) => (
            <Item key={`w${i}`} message={m} />
          ))}
        </ul>
      )}
      <p className={styles.muted}>Export is never blocked; these are the addon&apos;s own checks.</p>
    </>
  );
}

function Item({ message }: { message: ValidationMessage }) {
  return (
    <li className={styles[message.severity]} data-code={message.code} data-severity={message.severity}>
      {message.auraId && <span className={styles.where}>{message.auraId}</span>}
      {message.pointer && <span className={styles.where}>{message.pointer.label}</span>}
      <span>{message.message}</span>
    </li>
  );
}
