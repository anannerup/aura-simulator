/** Where the core gets Musca Auras' source files from. */

/** Reads one file of the addon repo, by path relative to the repo root (e.g. "WeakAuras/Init.lua"). */
export type AddonSourceFetcher = (path: string) => Promise<string>;

export const DEFAULT_ADDON_REF = "v1.15.0";
export const ADDON_REPO = "dldvlpr-addons-wow/Musca-Auras";

export function jsDelivrUrl(ref: string, path: string): string {
  return `https://cdn.jsdelivr.net/gh/${ADDON_REPO}@${encodeURIComponent(ref)}/${path}`;
}

/** Fetches files from GitHub through jsDelivr (sends CORS headers, so it works in the browser). */
export function jsDelivrFetcher(ref: string): AddonSourceFetcher {
  return async (path) => {
    const url = jsDelivrUrl(ref, path);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${path} of Musca Auras ${ref}: HTTP ${res.status} (${url})`);
    return res.text();
  };
}

/** Files the core loads, in load order. */
export const ADDON_FILES = {
  libStub: "WeakAuras/Libs/LibStub/LibStub.lua",
  libDeflate: "WeakAuras/Libs/LibDeflate/LibDeflate.lua",
  libSerialize: "WeakAuras/Libs/LibSerialize/LibSerialize.lua",
  init: "WeakAuras/Init.lua",
  weakAuras: "WeakAuras/WeakAuras.lua",
  transmission: "WeakAuras/Transmission.lua",
} as const;
