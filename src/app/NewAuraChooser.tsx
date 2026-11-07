"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuraCore, AuraDocument, AuraPacks, LuaObject, NewAuraPage } from "@/core";
import { AuraRegion } from "@/render/AuraPreview";
import { evaluateAura } from "@/render/conditions";
import { DEFAULT_SITUATION } from "@/render/situation";
import { displayIconRef, iconNameUrl } from "@/render/textures";
import type { EditResult } from "@/client/workspace/session";
import { findNode, isDynamicGroupDoc, type WorkspaceNode } from "@/workspace";
import styles from "./NewAuraChooser.module.css";

export interface NewAuraChooserProps {
  core: AuraCore;
  items: WorkspaceNode[];
  selectedId: string | null;
  /** Makes a new aura of the type with the addon's New Aura and places it (`WorkspaceSession.createAura`). */
  onCreate(regionType: string, sourceData?: LuaObject): Promise<EditResult>;
  /** Imports a state code (a pack). */
  onImport(code: string): EditResult;
  onCancel(): void;
}

const isGroupType = (t: string) => t === "group" || t === "dynamicgroup";

/**
 * The window's New Aura page, read from the addon (OptionsFrame.lua frame.NewAura): Packs and Premade Auras, then
 * the Modern Aura Group and every display type the addon registers, with the game's names and descriptions. New
 * auras are made by the addon's own WeakAuras.NewAura, so they start as they do in the game, and go where the game
 * puts them (into a selected group, else after the selection).
 */
export function NewAuraChooser({ core, items, selectedId, onCreate, onImport, onCancel }: NewAuraChooserProps) {
  const [page, setPage] = useState<NewAuraPage | null>(null);
  const [samples, setSamples] = useState<Record<string, AuraDocument>>({});
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"new" | "packs">("new");

  useEffect(() => {
    let cancelled = false;
    core.newAuraPage().then(
      async (p) => {
        if (cancelled) return;
        setPage(p);
        // The new aura of each type, for its thumbnail.
        const made: Record<string, AuraDocument> = {};
        for (const t of p.types) if (!isGroupType(t.regionType)) made[t.regionType] = await core.newAura(t.regionType).catch(() => ({}) as AuraDocument);
        if (!cancelled) setSamples(made);
      },
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [core]);

  // As in the game, a dynamic group can't hold groups: with one selected (or its child), group types are offered off.
  const target = selectedId ? findNode(items, selectedId) : null;
  const inDynamic = !!target && (isDynamicGroupDoc(target.node.aura) || (!target.node.items && !!target.parent && isDynamicGroupDoc(target.parent.aura)));

  async function create(regionType: string, sourceData?: Record<string, unknown>) {
    setError(null);
    const r = await onCreate(regionType, sourceData as LuaObject | undefined);
    if (!r.ok) setError(r.error);
  }

  if (view === "packs") return <PacksPage core={core} onImport={onImport} onBack={() => setView("new")} onCancel={onCancel} />;

  const groupOff = "A dynamic group can't hold groups";
  return (
    <section className={styles.chooser} aria-label="New aura">
      <div className={styles.scroll}>
        {!page && !error && <p className={styles.loading}>Loading the addon&apos;s display types…</p>}
        {page && (
          <>
            <h2 className={styles.heading}>Simple</h2>
            <ul className={styles.list}>
              <Entry name={page.packs.name} description={page.packs.description} thumb={page.packs.icon && <IconThumb source={page.packs.icon} />} onClick={() => setView("packs")} />
              <Entry
                name={page.premade.name}
                description={page.premade.description}
                thumb={page.premade.icon && <IconThumb source={page.premade.icon} />}
                disabledReason="Premade auras come from the WeakAurasTemplates addon, which the simulator doesn't run. Describe the aura to your agent instead."
              />
            </ul>
            <h2 className={styles.heading}>Advanced</h2>
            <ul className={styles.list}>
              <Entry
                name={page.modernGroup.name}
                description={page.modernGroup.description}
                thumb={<ModernGroupThumb />}
                disabledReason={inDynamic ? groupOff : undefined}
                onClick={() => create("group", page.modernGroup.sourceData)}
                type="modern-group"
              />
              {page.types.map((t) => (
                <Entry
                  key={t.regionType}
                  type={t.regionType}
                  name={t.displayName}
                  description={t.description ?? ""}
                  thumb={<TypeThumb regionType={t.regionType} icon={t.icon} sample={samples[t.regionType]} />}
                  disabledReason={inDynamic && isGroupType(t.regionType) ? groupOff : undefined}
                  onClick={() => create(t.regionType)}
                />
              ))}
            </ul>
          </>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function Entry(props: { name: string; description: string; thumb?: ReactNode; disabledReason?: string; onClick?: () => void; type?: string }) {
  const { name, description, thumb, disabledReason, onClick, type } = props;
  return (
    <li>
      <button
        type="button"
        className={styles.entry}
        disabled={!!disabledReason || !onClick}
        title={disabledReason}
        data-type={type}
        onClick={onClick}
      >
        <span className={styles.thumb}>{thumb}</span>
        <span className={styles.text}>
          <span className={styles.name}>{name}</span>
          <span className={styles.description}>{description}</span>
          {disabledReason && <span className={styles.reason}>{disabledReason}</span>}
        </span>
      </button>
    </li>
  );
}

const THUMB = 40;

/** A type's thumbnail: its registered texture, or the new aura drawn by the simulator's renderer. */
function TypeThumb({ regionType, icon, sample }: { regionType: string; icon?: string; sample?: AuraDocument }) {
  const state = useMemo(() => (sample?.regionType ? evaluateAura(sample, DEFAULT_SITUATION) : null), [sample]);
  if (icon) return <IconThumb source={icon} />;
  if (regionType === "group")
    return (
      <span className={styles.thumbGroup} aria-hidden>
        <i />
        <i />
        <i />
      </span>
    );
  if (regionType === "dynamicgroup")
    return (
      <span className={styles.thumbDynamic} aria-hidden>
        <i />
        <i />
      </span>
    );
  if (!sample?.regionType || !state || regionType === "empty") return <span className={styles.thumbEmpty} aria-hidden />;
  const w = typeof sample.width === "number" ? sample.width : 64;
  const h = typeof sample.height === "number" ? sample.height : 64;
  const scale = Math.min(THUMB / w, THUMB / h, 1);
  return (
    <span className={styles.thumbRegion} aria-hidden>
      <span style={{ position: "absolute", left: "50%", top: "50%", width: w, height: h, transform: `translate(-50%, -50%) scale(${scale})` }}>
        <AuraRegion aura={{ ...sample, selfPoint: "TOPLEFT" }} rect={{ x: 0, y: 0, width: w, height: h }} state={state} />
      </span>
    </span>
  );
}

/** A game icon (`Interface\\Icons\\…`) from the icon image server. */
function IconThumb({ source, size = THUMB }: { source: string; size?: number }) {
  const ref = displayIconRef(source);
  if (ref?.kind !== "name") return <span className={styles.thumbEmpty} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element -- Wowhead image server, loaded at runtime
  return <img src={iconNameUrl(ref.name, "large")} alt="" width={size} height={size} />;
}

function ModernGroupThumb() {
  return (
    <span className={styles.thumbModern} aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

/** The window's Packs page: utility packs and every class's HUD pack (whole, or one block). */
function PacksPage({ core, onImport, onBack, onCancel }: { core: AuraCore; onImport: NewAuraChooserProps["onImport"]; onBack(): void; onCancel(): void }) {
  const [packs, setPacks] = useState<AuraPacks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    core.packs().then(
      (p) => !cancelled && setPacks(p),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [core]);

  const add = (name: string, code: string | (() => string)) => {
    try {
      const r = onImport(typeof code === "string" ? code : code());
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        setDone(name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const categories = packs ? [...new Set(packs.utility.map((p) => p.category ?? ""))] : [];

  return (
    <section className={styles.chooser} aria-label="Packs">
      <div className={styles.scroll}>
        <button type="button" className={styles.back} onClick={onBack}>
          ‹ New Aura
        </button>
        {!packs && !error && <p className={styles.loading}>Loading the addon&apos;s packs…</p>}
        {done && (
          <p className={styles.done} role="status">
            Added {done} to the workspace.
          </p>
        )}
        {packs && (
          <>
            <h2 className={styles.heading}>Class HUD</h2>
            {packs.classes.map((c) => (
              <details key={c.class} className={styles.classPack}>
                <summary>
                  <IconThumb source={c.icon ?? ""} size={20} /> {c.class.charAt(0) + c.class.slice(1).toLowerCase()}
                </summary>
                <ul className={styles.list}>
                  {c.code && <Entry name={c.name} description={c.description} thumb={c.icon && <IconThumb source={c.icon} />} onClick={() => add(`${c.class} ${c.name}`, c.code!)} />}
                  {c.blocks.map((b) => (
                    <Entry
                      key={b.label}
                      name={b.name}
                      description={b.description}
                      thumb={c.icon && <IconThumb source={c.icon} />}
                      onClick={() => add(b.name, () => core.encode({ aura: b.aura as AuraDocument, children: b.children as AuraDocument[] }))}
                    />
                  ))}
                </ul>
              </details>
            ))}
            <h2 className={styles.heading}>Utility Packs</h2>
            {categories.map((cat) => (
              <div key={cat}>
                {cat && <h3 className={styles.subheading}>{cat}</h3>}
                <ul className={styles.list}>
                  {packs.utility
                    .filter((p) => (p.category ?? "") === cat)
                    .map((p) => (
                      <Entry key={p.name} name={p.name} description={p.description} thumb={p.icon && <IconThumb source={p.icon} />} onClick={p.code ? () => add(p.name, p.code!) : undefined} />
                    ))}
                </ul>
              </div>
            ))}
          </>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}
