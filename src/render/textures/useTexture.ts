"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useTextureLoader, type TextureUrl } from "./loader";
import type { TextureSource } from "./paths";
import type { TextureVariant } from "./pixels";

export interface TextureState {
  /** The loaded texture, or null while loading / when it can't be drawn. */
  texture: TextureUrl | null;
  /** Why the texture can't be drawn (the game has no such file, or it couldn't be downloaded); null otherwise. */
  missing: string | null;
}

/** React hook: a texture variant's URL, or why it can't be drawn. */
export function useTextureState(source: TextureSource | null, variant: TextureVariant = {}): TextureState {
  const variantKey = JSON.stringify(variant);
  const requestKey = source === null ? null : `${source}|${variantKey}`;
  const loader = useTextureLoader();
  const [state, setState] = useState<{ key: string; value: TextureUrl | null; missing: string | null } | null>(null);
  useEffect(() => {
    if (source === null || requestKey === null) return;
    let live = true;
    loader
      .url(source, JSON.parse(variantKey) as TextureVariant)
      .then((value) => live && setState({ key: requestKey, value, missing: null }))
      .catch((err: unknown) => {
        console.warn("texture load failed", source, err);
        if (live) setState({ key: requestKey, value: null, missing: errorMessage(err) });
      });
    return () => {
      live = false;
    };
  }, [loader, source, variantKey, requestKey]);
  const current = state && state.key === requestKey ? state : null;
  return { texture: current?.value ?? null, missing: current?.missing ?? null };
}

/** React hook: the URL of a texture variant, or null while loading / on failure. */
export function useTextureUrl(source: TextureSource | null, variant: TextureVariant = {}): TextureUrl | null {
  return useTextureState(source, variant).texture;
}
