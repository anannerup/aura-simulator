"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuraCore } from "@/core";
import {
  clientSpellsOf,
  fetchDiff,
  fetchVersions,
  readStoredRef,
  resolveRef,
  serverAddonFetcher,
  storeRef,
} from "@/client/addon-client";
import type { AddonDiff, Resolution, VersionList } from "@/api/addon";
import type { Game } from "@/games";
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
  /** The release the loaded core is. */
  resolution: Resolution | null;
  /** The ref being loaded right now. */
  loadingRef: string | null;
  /** Why the last load failed. */
  error: string | null;
  /** Releases for the picker (null until listed or if listing failed). */
  versions: VersionList | null;
  /** What changed in the last switch. */
  diff: AddonDiffState | null;
  /** Loads another release. */
  load(ref: string): void;
}

async function loadCore(game: Game, ref: string): Promise<{ core: AuraCore; resolution: Resolution }> {
  const [{ loadAddon }, resolution] = await Promise.all([import("@/core"), resolveRef(game.id, ref)]);
  // Fetch by the real tag name, so the bundle URL (and its cache entry) is the same however the ref was typed.
  const core = await loadAddon(resolution.ref, {
    game: game.id,
    fetchSource: serverAddonFetcher(game.id, resolution.ref),
    wasmUri: WASM_URI,
    spellInfo: clientSpellsOf(game.id),
  });
  return { core, resolution };
}

/** Loads the aura core for the picked release of the game's addon (persisted per game; newest release by default). */
export function useAddonCore(game: Game): AddonCoreState {
  const [core, setCore] = useState<AuraCore | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [loadingRef, setLoadingRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionList | null>(null);
  const [diff, setDiff] = useState<AddonDiffState | null>(null);
  const generation = useRef(0);
  const coreRef = useRef<AuraCore | null>(null);

  /** Makes `next` the core in use and frees the one it replaces (its full VM is a Web Worker with its own Lua heap). */
  const adopt = useCallback((next: { core: AuraCore; resolution: Resolution }) => {
    const replaced = coreRef.current;
    coreRef.current = next.core;
    setCore(next.core);
    setResolution(next.resolution);
    if (replaced && replaced !== next.core) replaced.dispose();
  }, []);

  const run = useCallback(
    async (ref: string, fallbackRef?: string) => {
      const gen = ++generation.current;
      const previous = coreRef.current;
      setLoadingRef(ref);
      setError(null);
      let loaded: Awaited<ReturnType<typeof loadCore>>;
      try {
        loaded = await loadCore(game, ref);
      } catch (e) {
        if (gen !== generation.current) return;
        const message = errorMessage(e);
        setError(`Could not load ${game.addon.name} ${ref}: ${message}`);
        setLoadingRef(null);
        if (!previous && fallbackRef && fallbackRef !== ref) {
          // The stored version is gone: fall back to the default but leave the error visible.
          try {
            const fb = await loadCore(game, fallbackRef);
            if (gen !== generation.current) return fb.core.dispose();
            adopt(fb);
          } catch {}
        }
        return;
      }
      if (gen !== generation.current) return loaded.core.dispose();
      adopt(loaded);
      setLoadingRef(null);
      storeRef(game.id, loaded.core.ref);
      if (previous && previous.ref !== loaded.core.ref) {
        const state: AddonDiffState = { from: previous.ref, to: loaded.core.ref };
        setDiff(state);
        fetchDiff(game.id, state.from, state.to).then(
          (result) => setDiff((d) => (d === state ? { ...state, result } : d)),
          (err: unknown) => setDiff((d) => (d === state ? { ...state, error: errorMessage(err) } : d)),
        );
      }
    },
    [adopt, game],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchVersions(game.id).catch(() => null);
      if (cancelled) return;
      setVersions(list);
      const defaultRef = list?.defaultRef ?? game.addon.fallbackRef;
      await run(readStoredRef(game.id) ?? defaultRef, defaultRef);
    })();
    return () => {
      cancelled = true;
    };
  }, [run, game]);

  const load = useCallback((ref: string) => void run(ref.trim()), [run]);

  return { core, resolution, loadingRef, error, versions, diff, load };
}
