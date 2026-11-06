"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useShell } from "@/components/shell";
import { BookIcon, Button, CheckIcon, CodeIcon, CopyIcon, TextArea, useToast } from "@/components/ui";
import styles from "./StateCode.module.css";

/** Copies the state code; the label turns to "Copied" for a moment and a toast confirms it. */
export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      toast("Could not copy: the browser blocked the clipboard", { tone: "danger" });
      return;
    }
    setCopied(true);
    toast("State code copied, ready to import in the game");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button variant="primary" icon={copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />} onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/** The state code as a compact pill for the top bar; clicking it opens the drawer with the full code. */
export function StateCodePill({ code }: { code: string }) {
  const { drawerOpen, setDrawerOpen } = useShell();
  return (
    <button
      type="button"
      className={styles.pill}
      aria-label="Show full code"
      aria-expanded={drawerOpen}
      title={`${code.length.toLocaleString()} characters: show the full code`}
      onClick={() => setDrawerOpen(!drawerOpen)}
    >
      <CodeIcon size={14} className={styles.pillIcon} />
      <span className={styles.pillCode}>{code}</span>
      <span className={styles.pillLength}>{formatLength(code.length)}</span>
    </button>
  );
}

const formatLength = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** The drawer body: the whole state code, selectable, and where agents read about it. */
export function StateCodeDrawer({ code }: { code: string }) {
  return (
    <div className={styles.drawer}>
      <TextArea
        mono
        className={styles.code}
        readOnly
        value={code}
        aria-label="State code"
        rows={4}
        onFocus={(e) => e.currentTarget.select()}
      />
      <p className={styles.hint}>
        In the game, paste it into Musca Auras&apos; Import dialog. <BookIcon size={12} className={styles.hintIcon} /> Agents: see{" "}
        <Link href="/docs/agents">/docs/agents</Link>.
      </p>
    </div>
  );
}
