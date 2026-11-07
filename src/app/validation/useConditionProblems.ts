"use client";

import { useEffect, useState } from "react";
import { auraTriggers, conditionProblem, type AuraCore, type AuraDocument, type ConditionProblem } from "@/core";
import type { WorkspaceNode } from "@/workspace";

type Checks = WeakMap<AuraDocument, Promise<ConditionProblem | undefined>>;

function modernLeaves(items: WorkspaceNode[]): AuraDocument[] {
  return items.flatMap((node) =>
    node.items ? modernLeaves(node.items) : auraTriggers(node.aura).some((t) => t.kind === "secretAura") ? [node.aura] : [],
  );
}

/**
 * The core's verdict on the Aura (Modern) conditions of every aura in the workspace, by aura id: what the game screen
 * applies (a rejected set of conditions doesn't run at all). Each document is validated once per addon version.
 */
export function useConditionProblems(core: AuraCore | null, items: WorkspaceNode[]): ReadonlyMap<string, ConditionProblem> {
  const [problems, setProblems] = useState<ReadonlyMap<string, ConditionProblem>>(() => new Map());
  const [checksByCore] = useState(() => new WeakMap<AuraCore, Checks>());

  useEffect(() => {
    if (!core) return;
    let cancelled = false;
    const checks = checksByCore.get(core) ?? new WeakMap();
    checksByCore.set(core, checks);
    const pending = modernLeaves(items).map(async (aura) => {
      let check = checks.get(aura);
      if (!check) {
        check = core.validate({ aura, children: [] }).then(conditionProblem, () => undefined);
        checks.set(aura, check);
      }
      return [aura.id, await check] as const;
    });
    void Promise.all(pending).then((results) => {
      if (cancelled) return;
      const found = new Map<string, ConditionProblem>();
      for (const [id, problem] of results) if (typeof id === "string" && problem) found.set(id, problem);
      setProblems((prev) => (prev.size === 0 && found.size === 0 ? prev : found));
    });
    return () => {
      cancelled = true;
    };
  }, [core, items, checksByCore]);

  return problems;
}
