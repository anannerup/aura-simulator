"use client";

import { useId } from "react";
import {
  auraRules,
  situationForAura,
  triggerSituation,
  withAuraTrigger,
  withoutAura,
  withTrigger,
  type AddonGameId,
  type AuraDocument,
  type Situation,
  type TriggerKind,
  type TriggerSituation,
} from "@/core";
import { Input, Slider, Switch } from "@/components/ui";
import styles from "./SituationControls.module.css";

const KIND_LABELS: Record<TriggerKind, { title: string; present: string; remaining: string; duration: string; stacks: string }> = {
  secretAura: { title: "Aura (Modern)", present: "Aura present", remaining: "Time left", duration: "Duration", stacks: "Stacks" },
  aura2: { title: "Aura", present: "Aura present", remaining: "Time left", duration: "Duration", stacks: "Stacks" },
  spellCooldown: { title: "Spell cooldown", present: "On cooldown", remaining: "Cooldown left", duration: "Cooldown", stacks: "Charges" },
  itemCount: { title: "Item count", present: "In bags", remaining: "Time left", duration: "Duration", stacks: "Count" },
  other: { title: "Trigger", present: "Present", remaining: "Time left", duration: "Duration", stacks: "Stacks" },
};

/**
 * Time left as the panel shows it: "1m 05s", "45s", "9.5s". Tenths only under 10 seconds: in the panel's narrow font
 * the decimal point is easy to miss ("45.0s" read as "450s").
 */
export function formatSeconds(s: number): string {
  if (s >= 59.5) {
    const whole = Math.round(s);
    return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, "0")}s`;
  }
  return s >= 10 ? `${Math.round(s)}s` : `${(Math.round(s * 10) / 10).toFixed(1)}s`;
}

/**
 * The situation controls: per trigger present/time left/stacks, plus target and combat, by the game's rules (its trigger
 * kinds; entering combat freezes auras only where the game restricts addons in combat). The triggers are the selected
 * aura's: what it sees, edited workspace-wide, or with "Only this aura" in that aura's own situation (`auras`), so
 * auras whose triggers share a number can show different things side by side.
 */
export function SituationControls({
  game,
  aura,
  situation,
  onChange,
}: {
  game: AddonGameId;
  aura: AuraDocument;
  situation: Situation;
  onChange: (next: Situation) => void;
}) {
  const rules = auraRules(game);
  const triggers = rules.auraTriggers(aura);
  const ids = useId();
  const auraId = typeof aura.id === "string" ? aura.id : undefined;
  const own = auraId !== undefined && situation.auras?.[auraId] !== undefined;
  const sees = situationForAura(situation, auraId);
  const setTrigger = (index: number, patch: Partial<TriggerSituation>) =>
    onChange(own && auraId !== undefined ? withAuraTrigger(situation, auraId, index, patch) : withTrigger(situation, index, patch));
  const setOwn = (on: boolean) => {
    if (auraId === undefined) return;
    if (!on) return onChange(withoutAura(situation, auraId));
    // Start the aura's own situation from what it sees now.
    onChange(triggers.reduce((s, { index }) => withAuraTrigger(s, auraId, index, {}), situation));
  };
  return (
    <section className={styles.panel} aria-label="Situation">
      <div className={styles.world}>
        <Switch label="Target exists" checked={situation.targetExists} onChange={(e) => onChange({ ...situation, targetExists: e.target.checked })} />
        <Switch
          label="In combat"
          role="switch"
          checked={situation.inCombat}
          onChange={(e) => onChange(rules.setInCombat(situation, e.target.checked))}
        />
      </div>
      {auraId !== undefined && triggers.length > 0 && (
        <div className={styles.world}>
          <Switch label="Only this aura" role="switch" checked={own} onChange={(e) => setOwn(e.target.checked)} />
        </div>
      )}
      {triggers.map(({ index, kind }) => {
        const t = triggerSituation(sees, index);
        const labels = KIND_LABELS[kind];
        const set = (patch: Partial<TriggerSituation>) => setTrigger(index, patch);
        return (
          <fieldset key={index} className={styles.trigger}>
            <legend className={styles.legend}>
              Trigger {index}: {labels.title}
            </legend>
            <Switch
              label={labels.present}
              checked={t.present}
              onChange={(e) => set(kind === "spellCooldown" && e.target.checked && t.remaining <= 0 ? { present: true, remaining: t.duration } : { present: e.target.checked })}
            />
            <div className={styles.slider}>
              <span className={styles.sliderHead}>
                <label className={styles.label} htmlFor={`${ids}-remaining-${index}`}>
                  {labels.remaining}
                </label>
                <output className={styles.value} htmlFor={`${ids}-remaining-${index}`}>
                  {formatSeconds(t.remaining)}
                </output>
              </span>
              <Slider
                id={`${ids}-remaining-${index}`}
                min={0}
                max={Math.max(t.duration, 0.1)}
                step={0.1}
                value={t.remaining}
                disabled={!t.present || t.duration <= 0}
                onChange={(e) => set({ remaining: Number(e.target.value) })}
              />
            </div>
            <div className={styles.numbers}>
              <label className={styles.number}>
                <span className={styles.label}>{labels.duration}</span>
                <span className={styles.withUnit}>
                  <Input size="sm" type="number" min={0} step={1} value={t.duration} onChange={(e) => set({ duration: Number(e.target.value) || 0 })} />
                  <span className={styles.unit}>s</span>
                </span>
              </label>
              <label className={styles.number}>
                <span className={styles.label}>{labels.stacks}</span>
                <Input size="sm" type="number" min={0} step={1} value={t.stacks} onChange={(e) => set({ stacks: Number(e.target.value) || 0 })} />
              </label>
            </div>
          </fieldset>
        );
      })}
    </section>
  );
}
