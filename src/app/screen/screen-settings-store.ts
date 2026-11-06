"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_SCREEN_SETTINGS, sanitizeScreenSettings, type ScreenSettings } from "@/render/screen/settings";

const KEY = "aura-simulator:screen-settings";

let current: ScreenSettings | null = null;
const listeners = new Set<() => void>();

function read(): ScreenSettings {
  if (current) return current;
  try {
    const raw = window.localStorage.getItem(KEY);
    current = sanitizeScreenSettings(raw ? JSON.parse(raw) : null);
  } catch {
    current = DEFAULT_SCREEN_SETTINGS;
  }
  return current;
}

function write(next: ScreenSettings) {
  current = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private windows and blocked storage: the settings just don't survive a reload.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mock screen settings, kept in localStorage. The server render uses the defaults. */
export function useScreenSettings(): [ScreenSettings, (patch: Partial<ScreenSettings>) => void] {
  const settings = useSyncExternalStore(subscribe, read, () => DEFAULT_SCREEN_SETTINGS);
  const update = useCallback((patch: Partial<ScreenSettings>) => write(sanitizeScreenSettings({ ...read(), ...patch })), []);
  return [settings, update];
}
