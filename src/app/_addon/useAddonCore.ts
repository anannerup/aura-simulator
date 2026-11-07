"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuraCore } from "@/core";
import {
  fetchClientSpells,
  fetchDiff,
  fetchVersions,
  readStoredRef,
  resolveRef,
  serverAddonFetcher,
  storeRef,
} from "@/client/addon-client";
import type { AddonDiff, Resolution, VersionList } from "@/api/addon";
import { errorMessage } from "@/lib/errors";

const WASM_URI = "/lua/liblua5.1.wasm";

export interface AddonDiffState {
  from: string;
  to: string;
  result?: AddonDiff;
  error?: string;
}

export interface AddonCoreState {
  /** The last successfully loaded core; stays in place while another version loads or after one fails. */
  core: AuraCore | null;
  /** What the loaded core's ref resolved to on the server (null when loaded straight from jsDelivr). */
  resolution: Resolution | null;
  /** The ref being loaded right now. */
  loadingRef: string | null;
  /** Why the last load failed. */
  error: string | null;
  /** Releases and branches for the picker (null until listed or if listing failed). */
  versions: VersionList | null;
  /** What changed in the last switch. */
  diff: AddonDiffState | null;
  /** Loads another release, branch or commit. */
  load(ref: string): void;
}

async function loadCore(ref: string): Promise<{ core: AuraCore; resolution: Resolution | null }> {
  const { loadAddon } = await import("@/core");
  const resolution = await resolveRef(ref);
  // Fetch by the immutable ref (tag or commit SHA) so every file comes from the same commit.
  const fetchSource = serverAddonFetcher(resolution?.ref ?? ref);
  const core = await loadAddon(ref, { fetchSource, wasmUri: WASM_URI, spellInfo: fetchClientSpells });
  return { core, resolution };
}

/** Loads the aura core for the picked addon version (persisted in localStorage; newest release by default). */
export function useAddonCore(): AddonCoreState {
  const [core, setCore] = useState<AuraCore | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [loadingRef, setLoadingRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionList | null>(null);
  const [diff, setDiff] = useState<AddonDiffState | null>(null);
  const generation = useRef(0);
  const coreRef = useRef<AuraCore | null>(null);

  /** Makes `next` the core in use and frees the one it replaces (its full VM is a Web Worker with its own Lua heap). */
  const adopt = useCallback((next: { core: AuraCore; resolution: Resolution | null }) => {
    const replaced = coreRef.current;
    coreRef.current = next.core;
    setCore(next.core);
    setResolution(next.resolution);
    if (replaced && replaced !== next.core) replaced.dispose();
  }, []);

  const run = useCallback(async (ref: string, fallbackRef?: string) => {
    const gen = ++generation.current;
    const previous = coreRef.current;
    setLoadingRef(ref);
    setError(null);
    let loaded: Awaited<ReturnType<typeof loadCore>>;
    try {
      loaded = await loadCore(ref);
    } catch (e) {
      if (gen !== generation.current) return;
      const message = errorMessage(e);
      setError(`Could not load Musca Auras ${ref}: ${message}`);
      setLoadingRef(null);
      if (!previous && fallbackRef && fallbackRef !== ref) {
        // The stored version is gone: fall back to the default but leave the error visible.
        try {
          const fb = await loadCore(fallbackRef);
          if (gen !== generation.current) return fb.core.dispose();
          adopt(fb);
        } catch {}
      }
      return;
    }
    if (gen !== generation.current) return loaded.core.dispose();
    adopt(loaded);
    setLoadingRef(null);
    storeRef(ref);
    if (previous && previous.ref !== ref) {
      const state: AddonDiffState = { from: previous.ref, to: ref };
      setDiff(state);
      fetchDiff(previous.ref, ref).then(
        (result) => setDiff((d) => (d === state ? { ...state, result } : d)),
        (err: unknown) => setDiff((d) => (d === state ? { ...state, error: errorMessage(err) } : d)),
      );
    }
  }, [adopt]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchVersions().catch(() => null);
      if (cancelled) return;
      setVersions(list);
      const { DEFAULT_ADDON_REF } = await import("@/core");
      const defaultRef = list?.defaultRef ?? DEFAULT_ADDON_REF;
      await run(readStoredRef() ?? defaultRef, defaultRef);
    })();
    return () => {
      cancelled = true;
    };
  }, [run]);

  const load = useCallback((ref: string) => void run(ref.trim()), [run]);

  return { core, resolution, loadingRef, error, versions, diff, load };
}
