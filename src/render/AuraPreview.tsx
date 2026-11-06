import type { CSSProperties } from "react";
import type { AuraDocument, LuaValue } from "@/core";
import { placeAura, strataZIndex, uiParent, type UiParent } from "./screen/geometry";
import type { Situation } from "./situation";
import { useAuraIconUrl } from "./textures";
import styles from "./AuraPreview.module.css";

export interface AuraPreviewProps {
  aura: AuraDocument;
  situation: Situation;
  /** UIParent in UI units; the mock screen (`src/render/screen`) scales the whole preview to the window. */
  screen?: UiParent;
}

const num = (v: LuaValue | undefined, fallback: number) => (typeof v === "number" ? v : fallback);

/** Draws an aura on a plain screen at its anchor, offset and size. Pure: props in, markup out. */
const DEFAULT_SCREEN = uiParent({ width: 1920, height: 1080, useUiScale: false, uiScale: 1 });

export function AuraPreview({ aura, situation, screen = DEFAULT_SCREEN }: AuraPreviewProps) {
  const { rect, frame } = placeAura(
    {
      anchorFrameType: aura.anchorFrameType,
      anchorFrameFrame: aura.anchorFrameFrame,
      anchorPoint: aura.anchorPoint,
      selfPoint: aura.selfPoint,
      width: num(aura.width, 64),
      height: num(aura.height, 64),
      xOffset: num(aura.xOffset, 0),
      yOffset: num(aura.yOffset, 0),
    },
    screen,
  );
  const regionStyle: CSSProperties = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    zIndex: strataZIndex(aura.frameStrata),
  };
  const name = typeof aura.id === "string" ? aura.id : "aura";

  return (
    <div className={styles.screen} style={{ width: screen.width, height: screen.height }} data-testid="aura-preview">
      {frame.label && (
        <div
          className={styles.standIn}
          style={{ left: frame.rect.x, top: frame.rect.y, width: frame.rect.width, height: frame.rect.height }}
          data-testid="anchor-stand-in"
        >
          <span className={styles.standInLabel}>{frame.label} (stand-in)</span>
        </div>
      )}
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
