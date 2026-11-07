/** Where the core gets an addon version's source files from. */

/** Reads one file of an addon version, by path relative to its root (e.g. "WeakAuras/Init.lua"). */
export type AddonSourceFetcher = (path: string) => Promise<string>;

/** Files the core loads, in load order. */
export const ADDON_FILES = {
  libStub: "WeakAuras/Libs/LibStub/LibStub.lua",
  libDeflate: "WeakAuras/Libs/LibDeflate/LibDeflate.lua",
  libSerialize: "WeakAuras/Libs/LibSerialize/LibSerialize.lua",
  init: "WeakAuras/Init.lua",
  weakAuras: "WeakAuras/WeakAuras.lua",
  transmission: "WeakAuras/Transmission.lua",
} as const;

/**
 * Lua source as the VMs run it: Unix newlines (the repo has files with CRLF; WeakAuras2's release zip has CRLF
 * throughout) and no UTF-8 byte order mark (the game skips it; Lua 5.1 can't parse it).
 */
export const normalizeNewlines = (s: string) => s.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
