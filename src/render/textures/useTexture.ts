"use client";

import { useEffect, useState } from "react";
import { textureLoader, type TextureUrl } from "./loader";
import type { TextureSource } from "./paths";
import type { TextureVariant } from "./pixels";

/** React hook: the URL of a texture variant, or null while loading / on failure. */
export function useTextureUrl(source: TextureSource | null, variant: TextureVariant = {}): TextureUrl | null {
  const variantKey = JSON.stringify(variant);
  const requestKey = source === null ? null : `${source}|${variantKey}`;
  const [state, setState] = useState<{ key: string; value: TextureUrl } | null>(null);
  useEffect(() => {
    if (source === null || requestKey === null) return;
    let live = true;
    textureLoader()
      .url(source, JSON.parse(variantKey) as TextureVariant)
      .then((value) => live && setState({ key: requestKey, value }))
      .catch((err) => console.warn("texture load failed", source, err));
    return () => {
      live = false;
    };
  }, [source, variantKey, requestKey]);
  return state && state.key === requestKey ? state.value : null;
}
