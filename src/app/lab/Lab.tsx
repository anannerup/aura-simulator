"use client";

import { useState } from "react";
import { AuraPreview } from "@/render/AuraPreview";
import { EXAMPLES } from "@/render/examples";
import { DEFAULT_SITUATION } from "@/render/situation";
import { SituationControls } from "../SituationControls";

export function Lab({ name }: { name: string }) {
  const aura = EXAMPLES[name];
  const [situation, setSituation] = useState(DEFAULT_SITUATION);
  return (
    <>
      <AuraPreview aura={aura} situation={situation} />
      <SituationControls aura={aura} situation={situation} onChange={setSituation} />
    </>
  );
}
