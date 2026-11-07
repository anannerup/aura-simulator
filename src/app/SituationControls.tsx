"use client";

import { useId } from "react";
import { auraTriggers, setInCombat, triggerSituation, withTrigger, type AuraDocument, type Situation, type TriggerKind } from "@/core";
import { Input, Slider, Switch } from "@/components/ui";
import styles from "./SituationControls.module.css";

const KIND_LABELS: Record<TriggerKind, { title: string; present: string; remaining: string; duration: string; stacks: string }> = {
  secretAura: { title: "Aura (Modern)", present: "Aura present", remaining: "Time left", duration: "Duration", stacks: "Stacks" },
  aura2: { title: "Aura", present: "Aura present", remaining: "Time left", duration: "Duration", stacks: "Stacks" },
  spellCooldown: { title: "Spell cooldown", present: "On cooldown", remaining: "Cooldown left", duration: "Cooldown", stacks: "Charges" },
  other: { title: "Trigger", present: "Active", remaining: "Time left", duration: "Duration", stacks: "Stacks" },
};

const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s` : `${s.toFixed(1)}s`);

/** The situation controls: per trigger present/time left/stacks, plus target and combat. */
export function SituationControls({ aura, situation, onChange }: { aura: AuraDocument; situation: Situation; onChange: (next: Situation) => void }) {
  const triggers = auraTriggers(aura);
  const ids = useId();
  return (
    <section className={styles.panel} aria-label="Situation">
      <div className={styles.world}>
        <Switch label="Target exists" checked={situation.targetExists} onChange={(e) => onChange({ ...situation, targetExists: e.target.checked })} />
        <Switch
          label="In combat"
          role="switch"
          checked={situation.inCombat}
          onChange={(e) => onChange(setInCombat(situation, e.target.checked))}
        />
      </div>
      {triggers.map(({ index, kind }) => {
        const t = triggerSituation(situation, index);
        const labels = KIND_LABELS[kind];
        const set = (patch: Parameters<typeof withTrigger>[2]) => onChange(withTrigger(situation, index, patch));
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
                  {fmt(t.remaining)}
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
