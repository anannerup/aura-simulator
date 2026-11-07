import { customTextMarker, type DrawnText } from "@/core";
import { WowString } from "./WowString";
import styles from "./regions.module.css";

/**
 * A text as the evaluation says it draws (`AuraRenderState.texts`/`displayText`), its WoW escapes interpreted as the
 * font string does (`WowString`). Custom text (%c) isn't evaluated (the aura's custom function isn't run), so each
 * placeholder draws as a marked `[%c]` that says so on hover.
 */
export function DrawnTextParts({ text }: { text: DrawnText | undefined }) {
  if (!text) return null;
  return (
    <>
      {text.parts.map((part, i) =>
        typeof part === "string" ? (
          <WowString key={i} text={part} />
        ) : (
          <span key={i} className={styles.customText} data-custom-text={part.custom} title="Custom text isn't evaluated in the simulator: the aura's custom text function isn't run">
            {customTextMarker(part.custom)}
          </span>
        ),
      )}
    </>
  );
}
