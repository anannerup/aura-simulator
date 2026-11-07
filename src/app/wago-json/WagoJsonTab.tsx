"use client";

import { useCallback, useMemo } from "react";
import type { WorkspaceSession } from "@/client/workspace/session";
import { JsonEditor } from "@/components/json-editor/JsonEditor";
import { Callout, WarningIcon } from "@/components/ui";
import { errorMessage } from "@/lib/errors";

/**
 * The drawer's JSON tab: the selected aura (a group with everything in it) as wago JSON, in the form wago.io's
 * Editor shows. Edits apply by wago's rules and the addon's own import (`session.applyWagoJson`), as one undo step.
 */
export function WagoJsonTab({ session, code }: { session: WorkspaceSession; code: string }) {
  // `code` is the selected aura's state code: the JSON follows it.
  const json = useMemo(() => {
    try {
      return { ok: true as const, text: session.wagoJson() ?? "" };
    } catch (e) {
      return { ok: false as const, error: errorMessage(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, code]);
  const apply = useCallback((text: string) => session.applyWagoJson(text), [session]);
  if (!json.ok) {
    return (
      <Callout tone="danger" icon={<WarningIcon size={14} />} role="alert">
        This aura has no wago JSON: {json.error}
      </Callout>
    );
  }
  return <JsonEditor value={json.text} onApply={apply} label="wago JSON" />;
}
