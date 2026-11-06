"use client";

import { useState } from "react";
import { AuraPreview } from "@/render/AuraPreview";
import { EXAMPLES } from "@/render/examples";
import { DEFAULT_SITUATION } from "@/render/situation";
import { SituationControls } from "../SituationControls";

export function Lab({ name }: { name: string }) {
  const aura = EXAMPLES[name];
  const [situation, setSituation] = useState(DEFAULT_SITUATION);
  const [replay, setReplay] = useState(0);
  return (
    <>
      <AuraPreview aura={aura} situation={situation} replay={replay} />
      <button type="button" onClick={() => setReplay((n) => n + 1)} title="Play the start animation again">
        Replay
      </button>
      <SituationControls aura={aura} situation={situation} onChange={setSituation} />
    </>
  );
}
