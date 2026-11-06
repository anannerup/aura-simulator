"use client";

import type { AuraDocument } from "@/core";
import { Badge } from "@/components/ui";
import { QUESTION_MARK_ICON, iconNameUrl, useAuraIconUrl } from "@/render/textures";
import styles from "./AuraList.module.css";

const REGION_LABELS: Record<string, string> = {
  icon: "Icon",
  aurabar: "Bar",
  text: "Text",
  texture: "Texture",
  progresstexture: "Progress",
  dynamicgroup: "Dynamic group",
  group: "Group",
  model: "Model",
  stopmotion: "Stop motion",
};

/**
 * The workspace's auras. For now the workspace holds one aura (plus its children), shown as the selected item;
 * groups and a tree come with ticket 12.
 */
export function AuraList({ auras, selected = 0 }: { auras: AuraDocument[]; selected?: number }) {
  return (
    <ul className={styles.list} aria-label="Auras in this workspace">
      {auras.map((aura, i) => (
        <AuraItem key={`${i}-${String(aura.uid ?? aura.id)}`} aura={aura} selected={i === selected} />
      ))}
    </ul>
  );
}

function AuraItem({ aura, selected }: { aura: AuraDocument; selected: boolean }) {
  const icon = useAuraIconUrl(aura) ?? iconNameUrl(QUESTION_MARK_ICON);
  const type = typeof aura.regionType === "string" ? aura.regionType : "";
  return (
    <li className={styles.item} aria-current={selected ? "true" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Wowhead image server, loaded at runtime */}
      <img className={styles.icon} src={icon} alt="" width={28} height={28} />
      <span className={styles.name}>{typeof aura.id === "string" ? aura.id : "Unnamed aura"}</span>
      {type && <Badge>{REGION_LABELS[type] ?? type}</Badge>}
    </li>
  );
}
