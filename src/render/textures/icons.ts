/**
 * Where renderers get Blizzard art from. Art is loaded at runtime and never committed.
 *
 * Spell icons: an aura names its icon by FileDataID (e.g. 135932) or texture path, or takes it from a
 * trigger's spell. The app's spell cache maps both to icon file names (`GET /api/icons`), and Wowhead's
 * image server serves the images by name. Lookups are batched and cached for the page's lifetime.
 */
import { useEffect, useSyncExternalStore } from "react";
import { triggerSpellId, type AuraDocument, type LuaValue } from "@/core";

const ICON_BASE = "https://wow.zamimg.com/images/wow/icons";
export const QUESTION_MARK_ICON = "inv_misc_questionmark";

/** Image URL of an icon by file name (lower case, no extension). Large is 56 px, medium 36, small 18. */
export function iconNameUrl(name: string, size: "small" | "medium" | "large" = "large"): string {
  return `${ICON_BASE}/${size}/${encodeURIComponent(name)}.jpg`;
}

/** Something an icon can be looked up by. */
export type IconRef = { kind: "file"; id: number } | { kind: "spell"; id: number } | { kind: "name"; name: string };

/** Icon name for a ref: a string when known, null when the source doesn't know it, undefined while not loaded. */
export type IconLookup = (ref: IconRef) => string | null | undefined;

const ICON_PATH = /^interface[\\/]+icons[\\/]+([^\\/]+?)(\.blp)?$/i;

/** Reads `displayIcon`: a FileDataID (number or numeric string) or an `Interface\Icons\...` path. */
export function displayIconRef(value: LuaValue | undefined): IconRef | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? { kind: "file", id: value } : null;
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (/^\d+$/.test(s)) return Number(s) > 0 ? { kind: "file", id: Number(s) } : null;
  const m = ICON_PATH.exec(s);
  return m ? { kind: "name", name: m[1].toLowerCase() } : null;
}

/**
 * Where the game takes an icon region's icon from, in order (RegionTypes/Icon.lua `UpdateIcon`):
 * `iconSource` 0 is the manual `displayIcon`; -1 (automatic, the default) is the active trigger's
 * icon, here the first trigger with a spell ID; N is trigger N's spell. Then `displayIcon`, then
 * the question mark.
 */
export function iconCandidates(aura: AuraDocument): IconRef[] {
  const source = typeof aura.iconSource === "number" ? aura.iconSource : -1;
  const refs: IconRef[] = [];
  if (source === -1) {
    for (let n = 1; n <= 40; n++) {
      const id = triggerSpellId(aura, n);
      if (id !== null) {
        refs.push({ kind: "spell", id });
        break;
      }
    }
  } else if (source > 0) {
    const id = triggerSpellId(aura, source);
    if (id !== null) refs.push({ kind: "spell", id });
  }
  const display = displayIconRef(aura.displayIcon);
  if (display) refs.push(display);
  return refs;
}

/**
 * Picks the aura's icon from its candidates. `pending` is true when a candidate ahead of the
 * answer hasn't loaded yet (`icon` is then null).
 */
export function resolveAuraIcon(aura: AuraDocument, lookup: IconLookup): { icon: string | null; pending: boolean } {
  for (const ref of iconCandidates(aura)) {
    const name = lookup(ref);
    if (name === undefined) return { icon: null, pending: true };
    if (name) return { icon: name, pending: false };
  }
  return { icon: QUESTION_MARK_ICON, pending: false };
}

type FetchIcons = (request: { files: number[]; spells: number[] }) => Promise<{
  files: Record<string, string | null>;
  spells: Record<string, string | null>;
}>;

const fetchIconsFromApi: FetchIcons = async ({ files, spells }) => {
  const params = new URLSearchParams();
  if (files.length) params.set("files", files.join(","));
  if (spells.length) params.set("spells", spells.join(","));
  const res = await fetch(`/api/icons?${params}`);
  if (!res.ok) throw new Error(`GET /api/icons: HTTP ${res.status}`);
  return res.json();
};

const keyOf = (ref: { kind: "file" | "spell"; id: number }) => `${ref.kind}:${ref.id}`;

/** A batched, cached icon lookup with change notification (for `useSyncExternalStore`). */
export function createIconStore(fetchIcons: FetchIcons = fetchIconsFromApi) {
  const known = new Map<string, string | null>();
  const requested = new Set<string>();
  const queue = { files: new Set<number>(), spells: new Set<number>() };
  const listeners = new Set<() => void>();
  let version = 0;
  let flushScheduled = false;

  const notify = () => {
    version++;
    listeners.forEach((l) => l());
  };

  async function flush() {
    flushScheduled = false;
    const files = [...queue.files];
    const spells = [...queue.spells];
    queue.files.clear();
    queue.spells.clear();
    if (!files.length && !spells.length) return;
    let result: Awaited<ReturnType<FetchIcons>> | null = null;
    try {
      result = await fetchIcons({ files, spells });
    } catch {
      // Treat as unknown so the preview falls back; `refresh()` retries.
    }
    for (const id of files) known.set(`file:${id}`, result?.files[id] ?? null);
    for (const id of spells) known.set(`spell:${id}`, result?.spells[id] ?? null);
    notify();
  }

  return {
    lookup(ref: IconRef): string | null | undefined {
      return ref.kind === "name" ? ref.name : known.get(keyOf(ref));
    },
    /** Queues lookups for refs not known or in flight yet; one request per tick. */
    request(refs: IconRef[]) {
      for (const ref of refs) {
        if (ref.kind === "name") continue;
        const key = keyOf(ref);
        if (known.has(key) || requested.has(key)) continue;
        requested.add(key);
        (ref.kind === "file" ? queue.files : queue.spells).add(ref.id);
      }
      if (!flushScheduled && (queue.files.size || queue.spells.size)) {
        flushScheduled = true;
        setTimeout(() => void flush(), 0);
      }
    },
    /** Records an icon already known (e.g. from a spell search hit), so the preview updates at once. */
    prime(ref: { kind: "file" | "spell"; id: number }, name: string | null) {
      const key = keyOf(ref);
      if (known.get(key) === name) return;
      known.set(key, name);
      requested.add(key);
      notify();
    },
    /** Forgets every answer (e.g. after a spell sync), so icons are looked up again. */
    refresh() {
      known.clear();
      requested.clear();
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,
  };
}

export type IconStore = ReturnType<typeof createIconStore>;

/** The page's shared icon store. */
export const iconStore: IconStore = createIconStore();

/** Image URL of an aura's icon, or null while it's still being looked up. */
export function useAuraIconUrl(aura: AuraDocument, store: IconStore = iconStore): string | null {
  const version = useSyncExternalStore(store.subscribe, store.getVersion, () => 0);
  useEffect(() => {
    store.request(iconCandidates(aura));
  }, [aura, store, version]);
  const { icon } = resolveAuraIcon(aura, store.lookup);
  return icon ? iconNameUrl(icon) : null;
}

/** Image URL for a FileDataID already looked up, else the question mark (kept for simple callers). */
export function iconUrl(fileDataId: number | string | undefined): string {
  const ref = displayIconRef(fileDataId);
  const name = ref ? iconStore.lookup(ref) : null;
  return iconNameUrl(name || QUESTION_MARK_ICON);
}

/** Image URL of one icon value (FileDataID, `spell:` ref or icon name), or null while it's being looked up or unknown. */
export function useIconUrl(value: LuaValue | undefined, store: IconStore = iconStore): string | null {
  const version = useSyncExternalStore(store.subscribe, store.getVersion, () => 0);
  const ref = displayIconRef(value);
  const key = ref ? JSON.stringify(ref) : "";
  useEffect(() => {
    if (key) store.request([JSON.parse(key) as IconRef]);
  }, [key, store, version]);
  const name = ref ? store.lookup(ref) : null;
  return name ? iconNameUrl(name, "medium") : null;
}
