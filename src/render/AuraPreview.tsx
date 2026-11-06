import type { CSSProperties } from "react";
import type { AuraDocument, LuaValue } from "@/core";
import { placeRegion } from "./anchor";
import type { Situation } from "./situation";
import { useAuraIconUrl } from "./textures";
import styles from "./AuraPreview.module.css";

export interface AuraPreviewProps {
  aura: AuraDocument;
  situation: Situation;
  /** Size of the drawn screen in UI units (1 unit = 1 CSS pixel for now; ticket 14 adds scale). */
  screen?: { width: number; height: number };
}

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

/** Draws an aura on a plain screen at its anchor, offset and size. Pure: props in, markup out. */
export function AuraPreview({ aura, situation, screen = { width: 800, height: 450 } }: AuraPreviewProps) {
  const width = num(aura.width, 64);
  const height = num(aura.height, 64);
  const { left, top } = placeRegion(screen, {
    width,
    height,
    anchorPoint: aura.anchorPoint,
    selfPoint: aura.selfPoint,
    xOffset: num(aura.xOffset, 0),
    yOffset: num(aura.yOffset, 0),
  });
  const regionStyle: CSSProperties = { left, top, width, height };
  const name = typeof aura.id === "string" ? aura.id : "aura";

  return (
    <div className={styles.screen} style={{ width: screen.width, height: screen.height }} data-testid="aura-preview">
      {situation.active && (
        <div className={styles.region} style={regionStyle} data-region-type={String(aura.regionType)}>
          {aura.regionType === "icon" ? (
            <IconRegion aura={aura} name={name} />
          ) : (
            <div className={styles.unsupported}>{String(aura.regionType)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function IconRegion({ aura, name }: { aura: AuraDocument; name: string }) {
  const desaturate = aura.desaturate === true;
  const src = useAuraIconUrl(aura);
  if (!src) return <span className={styles.icon} data-icon-loading />;
  return (
    // Blizzard art comes from Wowhead's image server at runtime; next/image would proxy it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.icon}
      src={src}
      alt={name}
      style={desaturate ? { filter: "grayscale(1)" } : undefined}
      draggable={false}
    />
  );
}
