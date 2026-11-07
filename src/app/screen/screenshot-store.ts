"use client";

import { useCallback, useEffect, useState } from "react";
import { idbStore } from "@/lib/idb";

/** The screenshot behind the mock screen. It stays in this browser (IndexedDB) and is never uploaded. */
export interface Screenshot {
  url: string;
  name: string;
  width: number;
  height: number;
}

const DB = "aura-simulator";
const STORE = "screen";
const KEY = "screenshot";

const store = idbStore(() => globalThis.indexedDB, DB, STORE);

async function describe(blob: Blob, name: string): Promise<Screenshot> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Not an image the browser can show");
  }
  return { url, name, width: img.naturalWidth, height: img.naturalHeight };
}

/** The stored screenshot, plus functions to replace and remove it. Storage failures only cost persistence. */
export function useScreenshot() {
  const [shot, setShot] = useState<Screenshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: Screenshot | null = null;
    (async () => {
      try {
        const saved = await store.run<{ blob: Blob; name: string } | undefined>("readonly", (s) => s.get(KEY));
        if (!saved || cancelled) return;
        loaded = await describe(saved.blob, saved.name);
        if (cancelled) URL.revokeObjectURL(loaded.url);
        else setShot(loaded);
      } catch {
        // No IndexedDB (private window, blocked storage) or a broken entry: start without a screenshot.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Free the previous object URL when the screenshot changes or the page goes away.
  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  const choose = useCallback(async (file: File) => {
    setError(null);
    try {
      const next = await describe(file, file.name);
      setShot(next);
      try {
        await store.run("readwrite", (s) => s.put({ blob: file, name: file.name }, KEY));
      } catch {
        setError("Shown, but could not be saved in this browser");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const clear = useCallback(async () => {
    setShot(null);
    setError(null);
    try {
      await store.run("readwrite", (s) => s.delete(KEY));
    } catch {
      // Nothing stored, or storage unavailable.
    }
  }, []);

  return { screenshot: shot, error, choose, clear };
}
