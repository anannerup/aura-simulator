import { DEFAULT_SITUATION, type Situation } from "@/core";

/**
 * The page's situation (what the game screen shows: time left, present or missing, stacks, target, combat): set by the
 * player's situation controls, by an agent over the push API (`PUT /api/<game>/workspaces/<id>/situation`, followed
 * through the workspace's event stream) or by `window.auraSimulator.situation`. One per page, kept across addon
 * versions. Subscribe for changes (`useSyncExternalStore`).
 */
export class PageSituation {
  private value: Situation = DEFAULT_SITUATION;
  private readonly listeners = new Set<() => void>();

  readonly get = () => this.value;

  readonly set = (next: Situation) => {
    if (next === this.value) return;
    this.value = next;
    for (const listener of this.listeners) listener();
  };

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
}
