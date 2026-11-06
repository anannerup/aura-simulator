"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckIcon, WarningIcon } from "./icons";
import styles from "./Toast.module.css";

type ToastTone = "success" | "danger" | "info";
interface ToastItem {
  id: number;
  message: ReactNode;
  tone: ToastTone;
}

type ShowToast = (message: ReactNode, options?: { tone?: ToastTone; durationMs?: number }) => void;

const ToastContext = createContext<ShowToast>(() => {});

/** Shows short confirmations ("Copied") at the bottom of the screen; announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const show = useCallback<ShowToast>((message, options) => {
    const id = next.current++;
    setItems((list) => [...list.slice(-2), { id, message, tone: options?.tone ?? "success" }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), options?.durationMs ?? 2200);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`${styles.toast} ${styles[t.tone]}`}>
            <span className={styles.icon}>{t.tone === "danger" ? <WarningIcon size={14} /> : <CheckIcon size={14} />}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Returns `show(message, { tone })`. */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}
