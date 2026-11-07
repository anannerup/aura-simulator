"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { readSituation, type AddonGameId, type AuraCore } from "@/core";
import { buildSearch } from "@/workspace";
import type { PageSituation } from "../situation";
import { installPageApi } from "./page-api";
import { EMPTY_VIEW, WorkspaceSession, type WorkspaceView } from "./session";

const noSubscription = () => () => {};
const emptyView = () => EMPTY_VIEW;

/** Leaves only `?w=` in the address (drops anything else). */
function cleanAddress(workspaceId: string) {
  const { pathname, search, hash } = window.location;
  const clean = buildSearch(workspaceId);
  if (clean !== search) window.history.replaceState(window.history.state, "", `${pathname}${clean}${hash}`);
}

/**
 * The page's workspace session of a game for an aura core, once restored (null before), and its view. A new core (another
 * addon version) starts a new session, which restores the same workspace; the old one shows until then. The restored
 * session also answers `window.auraSimulator` (see `page-api.ts`) and hands the situation an agent sets over the push
 * API to `situation`.
 */
export function useWorkspace(
  core: AuraCore | null,
  game: AddonGameId,
  situation: PageSituation,
): { view: WorkspaceView; session: WorkspaceSession | null } {
  const [session, setSession] = useState<WorkspaceSession | null>(null);

  useEffect(() => {
    if (!core) return;
    const s = new WorkspaceSession(core, game);
    let uninstall = () => {};
    let live = true;
    void s.start(window.location.search).then(() => {
      const id = s.getView().workspaceId;
      if (!live || !id) return;
      cleanAddress(id);
      uninstall = installPageApi(s, id, situation, game);
      s.followSituation((json) => {
        try {
          situation.set(readSituation(json, game));
        } catch {
          // The server only sends situations it read the same way.
        }
      });
      setSession(s);
    });
    return () => {
      live = false;
      uninstall();
      s.dispose();
    };
  }, [core, game, situation]);

  const view = useSyncExternalStore(session?.subscribe ?? noSubscription, session?.getView ?? emptyView, emptyView);
  return { view, session };
}
