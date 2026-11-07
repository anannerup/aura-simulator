/**
 * Browser side of the addon version picker: talks to a game's `/api/<game>/addon/*` and builds the source fetcher the
 * aura core loads through (the server's addon source cache: the whole bundle at once, single files as a fallback).
 */
import { MAX_CLIENT_SPELL_IDS, type AddonDiff, type Resolution, type VersionList } from "@/api/addon";
import {
  bundleFetcher,
  type AddonBundle,
  type AddonBundleSet,
  type AddonSourceFetcher,
  type ClientSpell,
  type SpellInfoSource,
} from "@/core";
import { fetchJson, HttpError } from "@/lib/fetch-json";

/** A game's addon API: `/api/<game>/addon`. */
const addonApi = (game: string) => `/api/${encodeURIComponent(game)}/addon`;

export function fetchVersions(game: string): Promise<VersionList> {
  return fetchJson(`${addonApi(game)}/versions`);
}

/** The release a ref names, from the server (throws when there is none, or the server can't answer). */
export function resolveRef(game: string, ref: string): Promise<Resolution> {
  return fetchJson(`${addonApi(game)}/resolve?ref=${encodeURIComponent(ref)}`);
}

/** Fetches one file through the server's addon cache. */
function perFileFetcher(game: string, ref: string): AddonSourceFetcher {
  return async (path) => {
    const res = await fetch(`${addonApi(game)}/${encodeURIComponent(ref)}/file?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new HttpError(res.status, `Could not load ${path} of ${ref}: HTTP ${res.status}`);
    return res.text();
  };
}

const BUNDLE_CACHE = "aura-simulator:addon-bundles";

function addonBundleUrl(game: string, ref: string, set: AddonBundleSet): string {
  return `${addonApi(game)}/${encodeURIComponent(ref)}/bundle?set=${set}&format=gzip`;
}

/** Inflates and checks a `format=gzip` bundle response. */
async function readBundle(res: Response, set: AddonBundleSet): Promise<AddonBundle> {
  if (!res.body) throw new Error("The addon bundle came without a body");
  const bundle = (await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).json()) as AddonBundle;
  if (bundle?.set !== set || typeof bundle.files !== "object" || bundle.files === null) {
    throw new Error("The addon bundle is malformed");
  }
  return bundle;
}

async function openBundleCache(): Promise<Cache | null> {
  try {
    return await caches.open(BUNDLE_CACHE);
  } catch {
    return null; // No Cache Storage (insecure origin, private mode, old browser).
  }
}

/**
 * One request for every file of a bundle set. Releases never change, so bundles are kept in Cache Storage under
 * their URL (game, tag and set), and a repeat visit needs no network.
 */
async function loadBundle(game: string, ref: string, set: AddonBundleSet): Promise<AddonBundle> {
  const url = addonBundleUrl(game, ref, set);
  const cache = await openBundleCache();
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) return await readBundle(hit, set);
    } catch {
      await cache.delete(url).catch(() => false);
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (cache && /\bimmutable\b/.test(res.headers.get("Cache-Control") ?? "")) {
    cache.put(url, res.clone()).catch(() => {});
  }
  return readBundle(res, set);
}

/**
 * Fetches files through the server's addon cache: the whole bundle set in one request (from Cache
 * Storage when it's there), then any file the bundle doesn't hold, or every file if the bundle
 * fails, one by one.
 */
export function serverAddonFetcher(game: string, ref: string, set: AddonBundleSet = "full"): AddonSourceFetcher {
  const perFile = perFileFetcher(game, ref);
  let fetcher: Promise<AddonSourceFetcher> | undefined;
  return async (path) => {
    fetcher ??= loadBundle(game, ref, set).then(
      (bundle) => bundleFetcher(bundle, perFile),
      () => perFile,
    );
    return (await fetcher)(path);
  };
}

/** What the game client knows about spells, from the game's spell cache on the server (for the addon VM). */
export function clientSpellsOf(game: string): SpellInfoSource {
  return async (ids) => {
    const out: Record<number, ClientSpell | null> = {};
    for (let i = 0; i < ids.length; i += MAX_CLIENT_SPELL_IDS) {
      Object.assign(out, await fetchJson(`${addonApi(game)}/spells?ids=${ids.slice(i, i + MAX_CLIENT_SPELL_IDS).join(",")}`));
    }
    return out;
  };
}

export function fetchDiff(game: string, from: string, to: string): Promise<AddonDiff> {
  return fetchJson(`${addonApi(game)}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

/** The release the player picked last, per game (browser storage). */
const refKey = (game: string) => `aura-simulator:${game}:addon-ref`;

export function readStoredRef(game: string): string | null {
  try {
    return window.localStorage.getItem(refKey(game));
  } catch {
    return null;
  }
}

export function storeRef(game: string, ref: string): void {
  try {
    window.localStorage.setItem(refKey(game), ref);
  } catch {}
}
