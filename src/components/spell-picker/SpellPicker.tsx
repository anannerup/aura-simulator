"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { setTriggerSpellId, triggerCount, triggerSpellId, type AuraDocument } from "@/core";
import { QUESTION_MARK_ICON, iconNameUrl, iconStore } from "@/render/textures";
import { FLAG_TEXT, getSpell, searchSpells, tooltipLines, type Spell, type SpellFlag, type SpellSearchHit } from "./spell-api";
import { SpellSync } from "./SpellSync";
import styles from "./SpellPicker.module.css";

export interface SpellPickerProps {
  aura: AuraDocument;
  /** Called with a copy of the aura whose trigger watches the chosen spell. */
  onAuraChange: (aura: AuraDocument) => void;
}

type Option = { id: number; name: string | null; icon: string | null; manual?: boolean };

const SMALL_ICON = (icon: string | null) => iconNameUrl(icon ?? QUESTION_MARK_ICON, "small");

/** Spell search and choice for the aura's trigger, with the spell cache's sync status and warnings. */
export function SpellPicker({ aura, onAuraChange }: SpellPickerProps) {
  const listId = useId();
  const [triggerIndex, setTriggerIndex] = useState(1);
  const [syncVersion, setSyncVersion] = useState(0);
  const triggers = Math.max(1, triggerCount(aura));
  const trigger = Math.min(triggerIndex, triggers);
  const currentId = triggerSpellId(aura, trigger);

  // The chosen spell's details and flags.
  const [info, setInfo] = useState<{ id: number; spell: Spell | null } | null>(null);
  useEffect(() => {
    if (currentId === null) return;
    let cancelled = false;
    getSpell(currentId)
      .then((spell) => {
        if (cancelled) return;
        setInfo({ id: currentId, spell });
        if (spell.icon) iconStore.prime({ kind: "spell", id: currentId }, spell.icon);
      })
      .catch(() => !cancelled && setInfo({ id: currentId, spell: null }));
    return () => {
      cancelled = true;
    };
  }, [currentId, syncVersion]);
  const current = info && info.id === currentId ? info.spell : null;

  // Live search.
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<{ q: string; hits: SpellSearchHit[] } | null>(null);
  const q = query.trim();
  useEffect(() => {
    if (!q) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      searchSpells(q, ac.signal)
        .then((r) => setResults({ q, hits: r.results }))
        .catch(() => {});
    }, 100);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, syncVersion]);
  const hits = results && results.q === q ? results.hits : [];
  const options: Option[] = [...hits];
  if (/^\d+$/.test(q) && Number(q) > 0 && Number.isSafeInteger(Number(q)) && !hits.some((h) => h.id === Number(q))) {
    options.unshift({ id: Number(q), name: null, icon: null, manual: true });
  }
  const showList = open && q !== "" && options.length > 0;
  const activeIndex = Math.min(active, options.length - 1);

  // Tooltip preview for the hovered or keyboard-selected option.
  const [hovered, setHovered] = useState<number | null>(null);
  const previewId = showList ? (hovered ?? options[activeIndex]?.id ?? null) : null;
  const [preview, setPreview] = useState<{ id: number; spell: Spell | null } | null>(null);
  useEffect(() => {
    if (previewId === null) return;
    let cancelled = false;
    const t = setTimeout(() => {
      getSpell(previewId)
        .then((spell) => !cancelled && setPreview({ id: previewId, spell }))
        .catch(() => !cancelled && setPreview({ id: previewId, spell: null }));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [previewId]);
  const previewSpell = preview && preview.id === previewId ? preview.spell : null;

  function choose(option: Option) {
    if (option.icon) iconStore.prime({ kind: "spell", id: option.id }, option.icon);
    onAuraChange(setTriggerSpellId(aura, trigger, option.id));
    setQuery("");
    setOpen(false);
    setHovered(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHovered(null);
      if (options.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = options[activeIndex];
      if (showList && option) choose(option);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <section className={styles.panel} aria-label="Spell">
      <SpellSync
        onSynced={() => {
          iconStore.refresh();
          setSyncVersion((v) => v + 1);
        }}
      />

      <div className={styles.current} data-testid="current-spell">
        {triggers > 1 && (
          <label className={styles.triggerSelect}>
            Trigger{" "}
            <select value={trigger} onChange={(e) => setTriggerIndex(Number(e.target.value))}>
              {Array.from({ length: triggers }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
        )}
        {currentId === null ? (
          <span className={styles.muted}>No spell on trigger {trigger} yet.</span>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Wowhead image server, loaded at runtime */}
            <img className={styles.icon} src={SMALL_ICON(current?.icon ?? null)} alt="" width={18} height={18} />
            <span className={styles.name}>{current?.name ?? (current ? "Unknown spell" : "…")}</span>
            <span className={styles.muted}>ID {currentId}</span>
            {current && <Flags flags={current.flags} />}
          </>
        )}
        {aura.iconSource === 0 && (
          <span className={styles.muted} title="iconSource 0: the icon is set by hand, not taken from the trigger's spell.">
            (manual icon)
          </span>
        )}
      </div>

      <div className={styles.search}>
        <input
          type="search"
          role="combobox"
          aria-label="Search spells"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
          placeholder="Search spells by name, or enter a spell ID"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            setHovered(null);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className={styles.input}
        />
        {showList && (
          <div className={styles.dropdown}>
            <ul id={listId} role="listbox" aria-label="Spells" className={styles.list}>
              {options.map((o, i) => (
                <li
                  key={`${o.manual ? "m" : "h"}${o.id}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={styles.option}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseEnter={() => {
                    setHovered(o.id);
                    setActive(i);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Wowhead image server, loaded at runtime */}
                  <img className={styles.icon} src={SMALL_ICON(o.icon)} alt="" width={18} height={18} />
                  <span className={styles.name}>{o.manual ? `Use spell ID ${o.id}` : o.name}</span>
                  {!o.manual && <span className={styles.muted}>{o.id}</span>}
                </li>
              ))}
            </ul>
            {previewId !== null && (
              <div className={styles.tooltip} role="tooltip" data-testid="spell-tooltip">
                {previewSpell ? <SpellTooltip spell={previewSpell} /> : <span className={styles.muted}>Loading…</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Flags({ flags }: { flags: SpellFlag[] }) {
  const shown = flags.filter((f) => FLAG_TEXT[f]);
  if (shown.length === 0) return null;
  return (
    <span className={styles.flags}>
      {shown.map((f) => (
        <span key={f} className={styles.flag} title={FLAG_TEXT[f]!.tooltip} data-flag={f}>
          {FLAG_TEXT[f]!.label}
        </span>
      ))}
    </span>
  );
}

function SpellTooltip({ spell }: { spell: Spell }) {
  const lines = tooltipLines(spell.tooltip);
  return (
    <>
      <div className={styles.tooltipHead}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Wowhead image server, loaded at runtime */}
        <img className={styles.tooltipIcon} src={spell.icon ? iconNameUrl(spell.icon, "medium") : iconNameUrl(QUESTION_MARK_ICON, "medium")} alt="" width={36} height={36} />
        <div>
          <div className={styles.name}>{spell.name ?? `Spell ${spell.id}`}</div>
          <div className={styles.muted}>ID {spell.id}</div>
        </div>
      </div>
      <Flags flags={spell.flags} />
      {lines.length > 0 ? (
        <div className={styles.tooltipText}>
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      ) : (
        <p className={styles.muted}>No Wowhead tooltip.</p>
      )}
    </>
  );
}
